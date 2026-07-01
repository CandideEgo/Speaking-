"""Subtitle editing service — CRUD for subtitle rows and word-level annotations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.schemas.video import (
    SubtitleBatchUpdate,
    SubtitleResponse,
    SubtitleUpdate,
    WordLevelsUpdate,
)
from app.services.video_cache import invalidate_video_detail_cache


async def update_subtitle(
    db: AsyncSession,
    video_id: str,
    subtitle_id: str,
    payload: SubtitleUpdate,
) -> SubtitleResponse:
    """Apply a partial admin edit to one subtitle.

    Editing ``text_en`` resets ``word_levels`` to the ECDICT baseline (the
    inflection index is derived from the English text), mirroring the ingest
    pipeline.  Pass ``preserve_word_levels=True`` to keep existing overrides.
    """
    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text

    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if subtitle is None:
        raise ValueError("Subtitle not found")
    if subtitle.video_id != video_id:
        raise ValueError("Subtitle does not belong to this video")

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

    await commit_refresh(db, subtitle)
    await invalidate_video_detail_cache(video_id)
    return SubtitleResponse.model_validate(subtitle)


async def update_subtitles_batch(
    db: AsyncSession,
    video_id: str,
    payload: SubtitleBatchUpdate,
) -> list[SubtitleResponse]:
    """Apply many subtitle edits in one transaction. All ids must belong to video_id."""
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

    updated: list[SubtitleResponse] = []
    for item in payload.updates:
        sub = subtitles_by_id[item.id]
        text_en_changed = item.text_en is not None and item.text_en != sub.text_en
        for field in ("text_en", "text_zh", "start_time", "end_time", "grammar_note", "speaker"):
            value = getattr(item, field)
            if value is not None:
                setattr(sub, field, value)
        if text_en_changed and not item.preserve_word_levels:
            levels = annotate_text(sub.text_en)
            sub.word_levels = levels or None
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
