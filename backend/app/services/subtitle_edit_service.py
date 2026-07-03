"""Subtitle editing service — CRUD for subtitle rows and word-level annotations."""

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
