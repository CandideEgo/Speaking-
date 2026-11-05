"""Pure re-segmentation, interval mapping and restorable snapshot rules.

Database capture/replacement stays in subtitle_edit_service. These functions
only plan the mapping; they never commit, delete rows or invalidate caches.
"""

from dataclasses import dataclass
from dataclasses import field as dc_field
from datetime import UTC, datetime


def resegment_segments(subs: list) -> list[dict]:
    """Re-cut a video's subtitles into proper sentences.

    Builds one word stream from all subtitles (real timestamps when present,
    else fabricated proportional timestamps from the concatenated text) and
    splits on sentence-end punctuation — regardless of duration, since the
    point of re-segmentation is to break up multi-sentence segments that the
    ingest pipeline emitted as one row. ``split_long_segments`` then catches
    any run-on sentence still over ~12s (by clause/count) and
    ``merge_short_segments`` folds single-word fragments back in.
    """
    from app.services.subtitle_segmentation import (
        _SENTENCE_END,
        _build_subsegment,
        _split_words_by_boundary,
        merge_short_segments,
        split_long_segments,
    )

    if not subs:
        return []

    all_words: list[dict] = []
    synthetic_ids: set[int] = set()
    if any(s.words for s in subs):
        for s in subs:
            if s.words:
                all_words.extend(s.words)
                continue
            # A manually added/edited cue can have no aligned words while its
            # neighbours do. Keep its text in the stream, using only its own
            # time span for splitting. These estimates must not be published
            # as genuine word alignment on any resulting segment.
            tokens = s.text_en.split()
            duration = max(0.1, s.end_time - s.start_time)
            for index, token in enumerate(tokens):
                word = {
                    "word": token,
                    "start": s.start_time + duration * index / len(tokens),
                    "end": s.start_time + duration * (index + 1) / len(tokens),
                }
                all_words.append(word)
                synthetic_ids.add(id(word))

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
            "words": s.get("words")
            if preserve_words and not any(id(word) in synthetic_ids for word in s.get("words", []))
            else None,
        }
        for s in segs
    ]


def subtitle_snapshot_dict(sub) -> dict:
    """Serialisable copy of one subtitle row for the re-segment snapshot."""
    return {
        "id": sub.id,
        "start_time": sub.start_time,
        "end_time": sub.end_time,
        "text_en": sub.text_en,
        "text_zh": sub.text_zh,
        "sentence_index": sub.sentence_index,
        "words": sub.words,
        "grammar_note": sub.grammar_note,
        "speaker": sub.speaker,
        "word_levels": sub.word_levels,
    }


def segment_bounds(seg: dict) -> tuple[float, float]:
    """``(start, end)`` of a segment.

    Accepts the re-cut segments (``start`` / ``end``) and the snapshot rows
    (``start_time`` / ``end_time``) so the same mapper serves both directions.
    """
    if "start" in seg:
        return float(seg["start"]), float(seg["end"])
    return float(seg["start_time"]), float(seg["end_time"])


def map_interval_to_segment(start: float, end: float, segments: list[dict]) -> int | None:
    """Index of the segment that best preserves the interval ``[start, end)``.

    Resolution order (the audit's suggested mapping):

    1. the segment whose ``[seg_start, seg_end)`` contains the old start time —
       when several do (nested/boundary cases), the shortest wins;
    2. otherwise the segment with the largest positive time overlap;
    3. ``None`` when nothing overlaps — the caller keeps the row in the snapshot
       payload instead of deleting it silently.
    """
    containing: list[tuple[int, float]] = []
    best_index: int | None = None
    best_overlap = 0.0
    for index, seg in enumerate(segments):
        seg_start, seg_end = segment_bounds(seg)
        if seg_start <= start < seg_end:
            containing.append((index, seg_end - seg_start))
        overlap = min(end, seg_end) - max(start, seg_start)
        if overlap > best_overlap + 1e-9:
            best_overlap = overlap
            best_index = index
    if containing:
        return min(containing, key=lambda item: item[1])[0]
    return best_index


@dataclass
class UserDataCapture:
    """Rows tied to subtitle ids that are about to be replaced (as plain dicts)."""

    favorites: list[dict] = dc_field(default_factory=list)
    revisions: list[dict] = dc_field(default_factory=list)
    vocabulary: list[dict] = dc_field(default_factory=list)


@dataclass
class RemapPlan:
    """How captured rows will be re-attached to the new subtitle ids."""

    # new_subtitle_id -> [row ids to UPDATE]
    favorites_move: dict[str, list[str]] = dc_field(default_factory=dict)
    revisions_move: dict[str, list[str]] = dc_field(default_factory=dict)
    vocabulary_move: dict[str, list[str]] = dc_field(default_factory=dict)
    # Rows that could not be attached to any new segment (kept in the snapshot).
    favorites_unmatched: list[dict] = dc_field(default_factory=list)
    revisions_unmatched: list[dict] = dc_field(default_factory=list)
    vocabulary_unmatched: list[dict] = dc_field(default_factory=list)
    # Favorites collapsed by the ``(user, subtitle)`` uniqueness rule (they are
    # not lost — only the duplicate row is; it is kept in the snapshot too).
    favorites_merged: list[dict] = dc_field(default_factory=list)


def build_remap_plan(capture: UserDataCapture, id_by_old: dict[str, str | None]) -> RemapPlan:
    """Decide the new owner of every captured row (pure: no DB access)."""
    plan = RemapPlan()

    seen_favorites: set[tuple[str, str]] = set()
    for row in capture.favorites:
        new_id = id_by_old.get(row["subtitle_id"])
        if new_id is None:
            plan.favorites_unmatched.append(row)
            continue
        key = (row["user_id"], new_id)
        if key in seen_favorites:
            plan.favorites_merged.append(row)
            continue
        seen_favorites.add(key)
        plan.favorites_move.setdefault(new_id, []).append(row["id"])

    for row in capture.revisions:
        new_id = id_by_old.get(row["subtitle_id"])
        if new_id is None:
            plan.revisions_unmatched.append(row)
        else:
            plan.revisions_move.setdefault(new_id, []).append(row["id"])

    for row in capture.vocabulary:
        new_id = id_by_old.get(row["subtitle_id"])
        if new_id is None:
            plan.vocabulary_unmatched.append(row)
        else:
            plan.vocabulary_move.setdefault(new_id, []).append(row["id"])

    return plan


def remap_counts(plan: RemapPlan) -> dict[str, int]:
    return {
        "favorites_remapped": sum(len(ids) for ids in plan.favorites_move.values()),
        "favorites_merged": len(plan.favorites_merged),
        "favorites_unmatched": len(plan.favorites_unmatched),
        "revisions_preserved": sum(len(ids) for ids in plan.revisions_move.values()),
        "revisions_unmatched": len(plan.revisions_unmatched),
        "vocabulary_relinked": sum(len(ids) for ids in plan.vocabulary_move.values()),
        "vocabulary_unmatched": len(plan.vocabulary_unmatched),
    }


def snapshot_payload(
    segments: list[dict],
    id_by_old: dict[str, str | None],
    capture: UserDataCapture,
    plan: RemapPlan,
) -> dict:
    """Snapshot JSON: restorable segments + mapping + the user rows involved.

    v2 shape (dict). v1 snapshots are plain lists; ``parse_snapshot_payload``
    accepts both so existing rows stay rollback-able. ``user_data.lost`` keeps
    every row that could not be remapped (unmatched + collapsed duplicates), so
    a rollback can put it back on the restored subtitle.
    """
    return {
        "version": 2,
        "segments": segments,
        "mapping": {old_id: new_id for old_id, new_id in id_by_old.items()},
        "user_data": {
            "captured": {
                "favorites": capture.favorites,
                "revisions": capture.revisions,
                "vocabulary": capture.vocabulary,
            },
            "lost": {
                "favorites": plan.favorites_unmatched + plan.favorites_merged,
                "revisions": plan.revisions_unmatched,
                "vocabulary": plan.vocabulary_unmatched,
            },
        },
    }


def parse_snapshot_payload(raw) -> tuple[list[dict], dict]:
    """Normalise a snapshot's ``segments_json`` into ``(segments, metadata)``.

    Handles both the v2 dict shape written above and the v1 plain-list shape
    written before ADM-01; the latter simply has no preservation metadata.
    """
    if isinstance(raw, dict) and "segments" in raw:
        return list(raw.get("segments") or []), raw
    return list(raw or []), {}


def parse_snapshot_dt(value: str | None) -> datetime:
    """Parse an ISO timestamp stored in the snapshot (falls back to now)."""
    if value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(UTC)
