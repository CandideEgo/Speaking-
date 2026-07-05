"""Subtitle editing service — CRUD for subtitle rows and word-level annotations."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.subtitle_revision import AUDITED_FIELDS, SubtitleRevision
from app.schemas.video import (
    SubtitleBatchUpdate,
    SubtitleResponse,
    SubtitleUpdate,
    WordLevelsUpdate,
)
from app.services.video_cache import invalidate_video_detail_cache


async def _determine_edit_scope(db: AsyncSession, video_id: str) -> str:
    """'standard' if this video IS the canonical standard for its URL, else 'fork'.

    Drives the ``scope`` column on SubtitleRevision (Grilling 决议 1/5): edits
    to a standard body are shared (affect future forks), edits to a fork are
    private to that user's copy.
    """
    from app.models.video_standard import VideoStandard

    result = await db.execute(select(VideoStandard).where(VideoStandard.canonical_video_id == video_id))
    return "standard" if result.scalar_one_or_none() is not None else "fork"


def _snapshot(subtitle) -> dict:
    """Capture the audited fields of a subtitle as a dict (before or after state)."""
    return {f: getattr(subtitle, f) for f in AUDITED_FIELDS}


def _diff(before: dict, after: dict) -> tuple[dict, dict] | None:
    """Return (before_delta, after_delta) of changed fields, or None if unchanged."""
    changed_before = {k: v for k, v in before.items() if v != after[k]}
    if not changed_before:
        return None
    changed_after = {k: after[k] for k in changed_before}
    return changed_before, changed_after


async def _write_revision(
    db: AsyncSession,
    subtitle,
    before_snap: dict,
    after_snap: dict,
    *,
    edited_by: str | None,
    scope: str,
) -> None:
    """Write a SubtitleRevision row if the edit actually changed anything."""
    diff = _diff(before_snap, after_snap)
    if diff is None:
        return
    before_delta, after_delta = diff
    db.add(
        SubtitleRevision(
            subtitle_id=subtitle.id,
            video_id=subtitle.video_id,
            edited_by=edited_by,
            scope=scope,
            before=before_delta,
            after=after_delta,
        )
    )


async def _validate_timing(db: AsyncSession, video_id: str, subtitle) -> None:
    """Validate a subtitle's timing after an edit has been applied in memory.

    Checks ``start_time < end_time`` and that the interval does not overlap its
    immediate neighbors (ordered by ``sentence_index``). Gaps and touching
    boundaries are allowed; overlaps are rejected. Raises ``ValueError`` — route
    handlers map that to HTTP 400.
    """
    from app.models.subtitle import Subtitle

    if subtitle.start_time >= subtitle.end_time:
        raise ValueError("start_time must be less than end_time")

    prev_q = (
        select(Subtitle)
        .where(
            Subtitle.video_id == video_id,
            Subtitle.id != subtitle.id,
            Subtitle.sentence_index < subtitle.sentence_index,
        )
        .order_by(Subtitle.sentence_index.desc())
        .limit(1)
    )
    next_q = (
        select(Subtitle)
        .where(
            Subtitle.video_id == video_id,
            Subtitle.id != subtitle.id,
            Subtitle.sentence_index > subtitle.sentence_index,
        )
        .order_by(Subtitle.sentence_index.asc())
        .limit(1)
    )
    prev = (await db.execute(prev_q)).scalar_one_or_none()
    nxt = (await db.execute(next_q)).scalar_one_or_none()
    if prev is not None and subtitle.start_time < prev.end_time:
        raise ValueError(f"start_time {subtitle.start_time} overlaps previous subtitle (ends at {prev.end_time})")
    if nxt is not None and subtitle.end_time > nxt.start_time:
        raise ValueError(f"end_time {subtitle.end_time} overlaps next subtitle (starts at {nxt.start_time})")


async def update_subtitle(
    db: AsyncSession,
    video_id: str,
    subtitle_id: str,
    payload: SubtitleUpdate,
    *,
    edited_by: str | None = None,
) -> SubtitleResponse:
    """Apply a partial admin edit to one subtitle.

    Editing ``text_en`` resets ``word_levels`` to the ECDICT baseline (the
    inflection index is derived from the English text), mirroring the ingest
    pipeline.  Pass ``preserve_word_levels=True`` to keep existing overrides.

    Phase 3: writes a ``SubtitleRevision`` audit row (before/after delta +
    ``scope`` fork|standard) capturing the edit, for history/rollback.
    ``edited_by`` should be the acting user's id.
    """
    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text

    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if subtitle is None:
        raise ValueError("Subtitle not found")
    if subtitle.video_id != video_id:
        raise ValueError("Subtitle does not belong to this video")

    before_snap = _snapshot(subtitle)

    text_en_changed = payload.text_en is not None and payload.text_en != subtitle.text_en

    for field in ("text_en", "text_zh", "start_time", "end_time", "grammar_note", "speaker"):
        value = getattr(payload, field)
        if value is not None:
            setattr(subtitle, field, value)

    await _validate_timing(db, video_id, subtitle)

    if text_en_changed and not payload.preserve_word_levels:
        # Re-derive word_levels from the new English text — same primitive the
        # finalize pipeline and backfill script use. This overwrites any manual
        # overrides on this line; UI should warn before editing text_en. Pass
        # ``preserve_word_levels=True`` to keep existing overrides.
        levels = annotate_text(subtitle.text_en)
        subtitle.word_levels = levels or None

    after_snap = _snapshot(subtitle)

    scope = await _determine_edit_scope(db, video_id)
    await _write_revision(db, subtitle, before_snap, after_snap, edited_by=edited_by, scope=scope)

    await commit_refresh(db, subtitle)
    await invalidate_video_detail_cache(video_id)
    return SubtitleResponse.model_validate(subtitle)


async def update_subtitles_batch(
    db: AsyncSession,
    video_id: str,
    payload: SubtitleBatchUpdate,
    *,
    edited_by: str | None = None,
) -> list[SubtitleResponse]:
    """Apply many subtitle edits in one transaction. All ids must belong to video_id.

    Phase 3: writes a ``SubtitleRevision`` per changed subtitle (scope resolved
    once for the whole batch — same video).
    """
    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text

    if not payload.updates:
        return []

    ids = [item.id for item in payload.updates]
    result = await db.execute(select(Subtitle).where(Subtitle.id.in_(ids)))
    subtitles_by_id = {s.id: s for s in result.scalars().all()}

    # Validate every target up front so we don't partially apply.
    for item in payload.updates:
        sub = subtitles_by_id.get(item.id)
        if sub is None:
            raise ValueError(f"Subtitle {item.id} not found")
        if sub.video_id != video_id:
            raise ValueError(f"Subtitle {item.id} does not belong to this video")

    scope = await _determine_edit_scope(db, video_id)
    updated: list[SubtitleResponse] = []
    for item in payload.updates:
        sub = subtitles_by_id[item.id]
        before_snap = _snapshot(sub)
        text_en_changed = item.text_en is not None and item.text_en != sub.text_en
        for field in ("text_en", "text_zh", "start_time", "end_time", "grammar_note", "speaker"):
            value = getattr(item, field)
            if value is not None:
                setattr(sub, field, value)
        await _validate_timing(db, video_id, sub)
        if text_en_changed and not item.preserve_word_levels:
            levels = annotate_text(sub.text_en)
            sub.word_levels = levels or None
        after_snap = _snapshot(sub)
        await _write_revision(db, sub, before_snap, after_snap, edited_by=edited_by, scope=scope)
        updated.append(SubtitleResponse.model_validate(sub))

    await db.commit()
    for sub in subtitles_by_id.values():
        if sub.id in ids:
            await db.refresh(sub)
    await invalidate_video_detail_cache(video_id)

    # Return in the order requested, refreshed.
    refreshed = {s.id: s for s in subtitles_by_id.values()}
    return [SubtitleResponse.model_validate(refreshed[item.id]) for item in payload.updates]


async def update_word_levels(
    db: AsyncSession,
    video_id: str,
    subtitle_id: str,
    payload: WordLevelsUpdate,
) -> SubtitleResponse:
    """Manually override one subtitle's word_levels (admin review)."""
    from app.models.subtitle import Subtitle

    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if subtitle is None:
        raise ValueError("Subtitle not found")
    if subtitle.video_id != video_id:
        raise ValueError("Subtitle does not belong to this video")

    subtitle.word_levels = payload.word_levels  # None clears all annotations
    await commit_refresh(db, subtitle)
    await invalidate_video_detail_cache(video_id)
    return SubtitleResponse.model_validate(subtitle)


async def split_subtitle(
    db: AsyncSession,
    video_id: str,
    subtitle_id: str,
    payload,  # SubtitleSplit
    *,
    edited_by: str | None = None,
) -> list:
    """Split one subtitle into two at ``payload.split_time``.

    The original subtitle becomes the ``text_before`` part (end trimmed to
    ``split_time``); a new subtitle is inserted after it for ``text_after``
    (start at ``split_time``, end at the original end). Word-level timestamps
    are partitioned at ``split_time`` so both parts keep precise timing.
    ``sentence_index`` of subsequent subtitles is shifted up by one.

    Returns ``[before_part, after_part]`` (both refreshed). A SubtitleRevision
    is written for the original subtitle's field changes; the new subtitle is
    audited implicitly via its existence (merge reverses a split).
    """
    from sqlalchemy import update

    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text

    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if subtitle is None:
        raise ValueError("Subtitle not found")
    if subtitle.video_id != video_id:
        raise ValueError("Subtitle does not belong to this video")
    if not (subtitle.start_time < payload.split_time < subtitle.end_time):
        raise ValueError("split_time must be within the subtitle's time range")

    before_snap = _snapshot(subtitle)
    original_end = subtitle.end_time
    original_index = subtitle.sentence_index
    cur_words = subtitle.words or []
    before_words = [w for w in cur_words if float(w.get("start", 0)) < payload.split_time]
    after_words = [w for w in cur_words if float(w.get("start", 0)) >= payload.split_time]

    # Shift subsequent subtitles up by one to free up original_index + 1.
    await db.execute(
        update(Subtitle)
        .where(
            Subtitle.video_id == video_id,
            Subtitle.sentence_index > original_index,
        )
        .values(sentence_index=Subtitle.sentence_index + 1)
    )

    # Original → before part.
    subtitle.text_en = payload.text_before
    subtitle.end_time = payload.split_time
    subtitle.words = before_words or None
    levels = annotate_text(subtitle.text_en)
    subtitle.word_levels = levels or None

    after_snap = _snapshot(subtitle)
    scope = await _determine_edit_scope(db, video_id)
    await _write_revision(db, subtitle, before_snap, after_snap, edited_by=edited_by, scope=scope)

    # New → after part.
    new_sub = Subtitle(
        video_id=video_id,
        start_time=payload.split_time,
        end_time=original_end,
        text_en=payload.text_after,
        text_zh=None,  # translation can't be auto-split; user re-translates
        sentence_index=original_index + 1,
        words=after_words or None,
        speaker=subtitle.speaker,
    )
    new_levels = annotate_text(new_sub.text_en)
    new_sub.word_levels = new_levels or None
    db.add(new_sub)

    await db.commit()
    await db.refresh(subtitle)
    await db.refresh(new_sub)
    await invalidate_video_detail_cache(video_id)
    return [SubtitleResponse.model_validate(subtitle), SubtitleResponse.model_validate(new_sub)]


async def merge_subtitle(
    db: AsyncSession,
    video_id: str,
    subtitle_id: str,
    *,
    edited_by: str | None = None,
) -> SubtitleResponse:
    """Merge a subtitle with the next one (by ``sentence_index``).

    The next subtitle's text/words/timing are folded into the current one and
    the next row is deleted. ``sentence_index`` of subtitles after the deleted
    row is shifted down by one. Returns the merged subtitle (refreshed).
    """
    from sqlalchemy import update

    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text

    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    cur = result.scalar_one_or_none()
    if cur is None:
        raise ValueError("Subtitle not found")
    if cur.video_id != video_id:
        raise ValueError("Subtitle does not belong to this video")

    nxt_result = await db.execute(
        select(Subtitle)
        .where(
            Subtitle.video_id == video_id,
            Subtitle.sentence_index > cur.sentence_index,
        )
        .order_by(Subtitle.sentence_index)
        .limit(1)
    )
    nxt = nxt_result.scalar_one_or_none()
    if nxt is None:
        raise ValueError("No next subtitle to merge with")

    before_snap = _snapshot(cur)
    next_index = nxt.sentence_index

    cur.text_en = (cur.text_en + " " + nxt.text_en).strip()
    cur.end_time = nxt.end_time
    merged_words = (cur.words or []) + (nxt.words or [])
    cur.words = merged_words or None
    if cur.text_zh and nxt.text_zh:
        cur.text_zh = (cur.text_zh + " " + nxt.text_zh).strip()
    elif nxt.text_zh:
        cur.text_zh = nxt.text_zh
    levels = annotate_text(cur.text_en)
    cur.word_levels = levels or None

    await db.delete(nxt)
    await db.flush()  # persist the delete before the index shift

    await db.execute(
        update(Subtitle)
        .where(
            Subtitle.video_id == video_id,
            Subtitle.sentence_index > next_index,
        )
        .values(sentence_index=Subtitle.sentence_index - 1)
    )

    after_snap = _snapshot(cur)
    scope = await _determine_edit_scope(db, video_id)
    await _write_revision(db, cur, before_snap, after_snap, edited_by=edited_by, scope=scope)

    await commit_refresh(db, cur)
    await invalidate_video_detail_cache(video_id)
    return SubtitleResponse.model_validate(cur)


async def recompute_word_levels(
    db: AsyncSession,
    video_id: str,
    subtitle_ids: list[str] | None = None,
) -> dict:
    """Recompute word_levels from ECDICT for selected subtitles (or the whole video).

    Mirrors the finalize pipeline's annotating step and the backfill script.
    Gracefully degrades when ECDICT is unavailable (returns zero counts, no 500).
    """
    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text, is_available

    if not is_available():
        return {"subtitles_updated": 0, "exam_words_found": 0}

    stmt = select(Subtitle).where(Subtitle.video_id == video_id)
    if subtitle_ids is not None:
        if not subtitle_ids:
            return {"subtitles_updated": 0, "exam_words_found": 0}
        stmt = stmt.where(Subtitle.id.in_(subtitle_ids))

    result = await db.execute(stmt)
    subtitles = result.scalars().all()

    updated = 0
    exam_words_found = 0
    for sub in subtitles:
        levels = annotate_text(sub.text_en)
        sub.word_levels = levels or None
        updated += 1
        if levels:
            exam_words_found += len(levels)

    await db.commit()
    await invalidate_video_detail_cache(video_id)
    return {"subtitles_updated": updated, "exam_words_found": exam_words_found}


def _revision_to_dict(r) -> dict:
    """Serialize a SubtitleRevision for the history endpoints."""
    return {
        "id": r.id,
        "subtitle_id": r.subtitle_id,
        "video_id": r.video_id,
        "edited_by": r.edited_by,
        "scope": r.scope,
        "before": r.before,
        "after": r.after,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


async def rollback_subtitle(
    db: AsyncSession,
    video_id: str,
    subtitle_id: str,
    revision_id: str,
    *,
    edited_by: str | None = None,
) -> SubtitleResponse:
    """Roll back a subtitle to the ``before`` state captured in a prior revision.

    Writes a new SubtitleRevision recording the rollback (so history is itself
    audited and reversible). The target revision must belong to this subtitle.
    """
    from app.models.subtitle import Subtitle
    from app.models.subtitle_revision import SubtitleRevision

    result = await db.execute(
        select(SubtitleRevision).where(
            SubtitleRevision.id == revision_id,
            SubtitleRevision.subtitle_id == subtitle_id,
        )
    )
    revision = result.scalar_one_or_none()
    if revision is None:
        raise ValueError("Revision not found")
    if revision.video_id != video_id:
        raise ValueError("Revision does not belong to this video")

    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if subtitle is None:
        raise ValueError("Subtitle not found")

    before_snap = _snapshot(subtitle)

    # Apply the prior 'before' values back onto the subtitle.
    for field, old_value in revision.before.items():
        setattr(subtitle, field, old_value)

    after_snap = _snapshot(subtitle)

    scope = await _determine_edit_scope(db, video_id)
    await _write_revision(db, subtitle, before_snap, after_snap, edited_by=edited_by, scope=scope)

    await commit_refresh(db, subtitle)
    await invalidate_video_detail_cache(video_id)
    return SubtitleResponse.model_validate(subtitle)


async def list_subtitle_revisions(
    db: AsyncSession,
    video_id: str,
    *,
    subtitle_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """List subtitle edit revisions for a video (optionally filtered to one subtitle).

    Returns ``{"items": [...], "has_more": bool}``, newest first.
    """
    from app.models.subtitle_revision import SubtitleRevision

    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    offset = (page - 1) * page_size

    stmt = select(SubtitleRevision).where(SubtitleRevision.video_id == video_id)
    if subtitle_id is not None:
        stmt = stmt.where(SubtitleRevision.subtitle_id == subtitle_id)
    stmt = stmt.order_by(SubtitleRevision.created_at.desc()).offset(offset).limit(page_size + 1)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = rows[:page_size]

    return {
        "items": [_revision_to_dict(r) for r in items],
        "has_more": has_more,
    }


# ---------------------------------------------------------------------------
# Bulk re-segmentation (admin) — snapshot, re-cut, rollback
# ---------------------------------------------------------------------------


def _resegment_segments(subs: list) -> list[dict]:
    """Re-cut a video's subtitles into proper sentences.

    Builds one word stream from all subtitles (real timestamps when present,
    else fabricated proportional timestamps from the concatenated text) and
    splits on sentence-end punctuation — regardless of duration, since the
    point of re-segmentation is to break up multi-sentence segments that the
    ingest pipeline emitted as one row. ``split_long_segments`` then catches
    any run-on sentence still over ~12s (by clause/count) and
    ``merge_short_segments`` folds single-word fragments back in.
    """
    from app.services.transcription.formatters import (
        _SENTENCE_END,
        _build_subsegment,
        _split_words_by_boundary,
        merge_short_segments,
        split_long_segments,
    )

    all_words: list[dict] = []
    for s in subs:
        if s.words:
            all_words.extend(s.words)

    if all_words:
        mega_start = all_words[0]["start"]
        mega_end = all_words[-1]["end"]
        preserve_words = True
    else:
        # No word timestamps — fabricate proportional ones from the text so the
        # sentence/clause split logic (which keys off word-level punctuation)
        # still works on legacy rows.
        mega_start = subs[0].start_time
        mega_end = subs[-1].end_time
        total_duration = max(0.1, mega_end - mega_start)
        full_text = " ".join(s.text_en for s in subs).strip()
        tokens = full_text.split()
        if not tokens:
            return []
        n = len(tokens)
        all_words = [
            {
                "word": tok,
                "start": mega_start + total_duration * (i / n),
                "end": mega_start + total_duration * ((i + 1) / n),
            }
            for i, tok in enumerate(tokens)
        ]
        preserve_words = False

    # 1) split on sentence-end punctuation → sentence-level segments
    groups = _split_words_by_boundary(all_words, _SENTENCE_END)
    segs = [g for g in (_build_subsegment(grp, mega_start, mega_end) for grp in groups) if g]
    # 2) split any run-on sentence still over ~12s (by clause, then word count)
    segs = split_long_segments(segs, max_duration=12.0)
    # 3) fold single-word / sub-second fragments into the prior segment
    segs = merge_short_segments(segs)

    return [
        {
            "start": s["start"],
            "end": s["end"],
            "text": s["text"],
            "words": s.get("words") if preserve_words else None,
        }
        for s in segs
    ]


async def resegment_video(
    db: AsyncSession,
    video_id: str,
    *,
    edited_by: str | None = None,
) -> dict:
    """Re-segment every subtitle of a video.

    Snapshots the current subtitles (so the change is reversible), re-cuts
    them into proper sentences, and replaces the rows. Translations (text_zh)
    are dropped because the English segmentation changed — the admin can
    re-trigger translation afterwards.

    Returns ``{before_count, after_count, translations_cleared, snapshot_id}``.
    """
    from app.models.subtitle import Subtitle
    from app.models.subtitle_resegment_snapshot import SubtitleResegmentSnapshot
    from app.services.ecdict import annotate_text

    result = await db.execute(select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index))
    subs = list(result.scalars().all())
    if not subs:
        raise ValueError("视频没有字幕，无法重断句")

    snapshot = SubtitleResegmentSnapshot(
        video_id=video_id,
        segments_json=[
            {
                "start_time": s.start_time,
                "end_time": s.end_time,
                "text_en": s.text_en,
                "text_zh": s.text_zh,
                "sentence_index": s.sentence_index,
                "words": s.words,
                "grammar_note": s.grammar_note,
                "speaker": s.speaker,
                "word_levels": s.word_levels,
            }
            for s in subs
        ],
        before_count=len(subs),
        applied_by=edited_by,
    )
    db.add(snapshot)

    new_segs = _resegment_segments(subs)
    if not new_segs:
        raise ValueError("重断句失败：无法从现有字幕生成新分段")

    for s in subs:
        await db.delete(s)
    await db.flush()

    for i, seg in enumerate(new_segs):
        levels = annotate_text(seg["text"])
        db.add(
            Subtitle(
                video_id=video_id,
                start_time=seg["start"],
                end_time=seg["end"],
                text_en=seg["text"],
                text_zh=None,  # translations cleared — segmentation changed
                sentence_index=i,
                words=seg.get("words"),
                word_levels=levels or None,
            )
        )

    snapshot.after_count = len(new_segs)
    await db.commit()
    await invalidate_video_detail_cache(video_id)
    return {
        "before_count": len(subs),
        "after_count": len(new_segs),
        "translations_cleared": True,
        "snapshot_id": snapshot.id,
    }


async def rollback_resegment(
    db: AsyncSession,
    video_id: str,
    *,
    edited_by: str | None = None,
) -> dict:
    """Restore subtitles from the latest re-segment snapshot.

    Deletes the current (re-segmented) subtitles and re-inserts the snapshotted
    rows, including their translations. The snapshot is marked rolled back.
    """
    from app.models.subtitle import Subtitle
    from app.models.subtitle_resegment_snapshot import SubtitleResegmentSnapshot

    result = await db.execute(
        select(SubtitleResegmentSnapshot)
        .where(
            SubtitleResegmentSnapshot.video_id == video_id,
            SubtitleResegmentSnapshot.rolled_back.is_(False),
        )
        .order_by(SubtitleResegmentSnapshot.applied_at.desc())
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()
    if snapshot is None:
        raise ValueError("没有可回滚的重断句快照")

    cur_result = await db.execute(select(Subtitle).where(Subtitle.video_id == video_id))
    for s in cur_result.scalars().all():
        await db.delete(s)
    await db.flush()

    for seg in snapshot.segments_json:
        db.add(
            Subtitle(
                video_id=video_id,
                start_time=seg["start_time"],
                end_time=seg["end_time"],
                text_en=seg["text_en"],
                text_zh=seg.get("text_zh"),
                sentence_index=seg["sentence_index"],
                words=seg.get("words"),
                grammar_note=seg.get("grammar_note"),
                speaker=seg.get("speaker"),
                word_levels=seg.get("word_levels"),
            )
        )

    snapshot.rolled_back = True
    snapshot.rolled_back_at = datetime.now(UTC)
    await db.commit()
    await invalidate_video_detail_cache(video_id)
    return {"restored_count": len(snapshot.segments_json), "snapshot_id": snapshot.id}
