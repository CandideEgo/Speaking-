"""Pre-generated AI word notes: read / write helpers for the gloss endpoint.

Provides:
  * ``get_note``              — fetch a single (word, source) row
  * ``get_best_note``         — video-specific first, then ``global`` fallback;
                               returns a plain dict ready for the gloss response
  * ``upsert_notes``          — write a batch of (word, level, source) rows
  * ``prewarm_video_notes``   — batch-generate AI notes for a video's exam-tagged
                               words (called from the finalize pipeline step)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models.word_note import WordAINote

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

GLOBAL_SOURCE = "global"


def _video_source(video_id: str) -> str:
    return f"video:{video_id}"


async def get_note(db: AsyncSession, word: str, source: str) -> WordAINote | None:
    """Fetch a single note row. Returns None if missing.

    Uses ``populate_existing`` so callers always see the latest committed
    state — important because the writer path (``upsert_notes``) is a bulk
    DML that bypasses SQLAlchemy's ORM identity-map invalidation, leaving
    stale instances cached from earlier reads of the same session.
    """
    stmt = (
        select(WordAINote)
        .where(WordAINote.word == word, WordAINote.context_source == source)
        .execution_options(populate_existing=True)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_best_note(db: AsyncSession, word: str, video_id: str | None = None) -> dict | None:
    """Return the best-available note for ``word`` (video-specific → global).

    Returns a plain dict {contextual_note, pitfalls, knowledge, source} ready
    for the gloss endpoint response, or None when neither exists.
    """
    if video_id:
        n = await get_note(db, word, _video_source(video_id))
        if n:
            return n.to_dict()
    n = await get_note(db, word, GLOBAL_SOURCE)
    if n:
        return n.to_dict()
    return None


async def upsert_notes(db: AsyncSession, notes: list[dict]) -> int:
    """Upsert a batch of note rows. Returns the number of rows affected.

    Each note dict: {word, level, context_source, contextual_note, pitfalls,
    knowledge, model_version?}. Existing (word, level, context_source) rows
    are overwritten so re-running a preheat is safe.
    """
    if not notes:
        return 0
    rows = [
        {
            "word": n["word"],
            "level": n["level"],
            "context_source": n["context_source"],
            "contextual_note": n.get("contextual_note") or "",
            "pitfalls": n.get("pitfalls") or "",
            "knowledge": n.get("knowledge") or "",
            "model_version": n.get("model_version"),
        }
        for n in notes
    ]
    # AsyncSession has no `.bind`; use get_bind() (works for both sync and async).
    bind = db.get_bind() if hasattr(db, "get_bind") else getattr(db, "bind", None)
    dialect_name = getattr(getattr(bind, "dialect", None), "name", "")
    if dialect_name == "postgresql":
        stmt = pg_insert(WordAINote).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_word_ai_notes_triple",
            set_={
                "contextual_note": stmt.excluded.contextual_note,
                "pitfalls": stmt.excluded.pitfalls,
                "knowledge": stmt.excluded.knowledge,
                "model_version": stmt.excluded.model_version,
            },
        )
    else:
        # SQLite (tests + dev). ON CONFLICT DO UPDATE is supported since 3.24.
        stmt = sqlite_insert(WordAINote).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["word", "level", "context_source"],
            set_={
                "contextual_note": stmt.excluded.contextual_note,
                "pitfalls": stmt.excluded.pitfalls,
                "knowledge": stmt.excluded.knowledge,
                "model_version": stmt.excluded.model_version,
            },
        )
    await db.execute(stmt)
    await db.commit()
    # Bulk DML doesn't tell SQLAlchemy which ORM instances to refresh, so the
    # identity map would still hand out stale objects (e.g. an earlier
    # ``get_note`` call's row) on the next read. Expire everything so the
    # next query re-fetches from the DB.
    db.expire_all()
    return len(rows)


# ---------------------------------------------------------------------------
# Prewarm: batch-generate AI notes for a video's exam-tagged words
# ---------------------------------------------------------------------------

# Priority ordering for exam levels (used to pick the "top" level per word)
_EXAM_LEVEL_PRIORITY = {
    "zhongkao": 1,
    "gaoKao": 2,
    "cet4": 3,
    "cet6": 4,
    "ky": 5,
    "ielts": 6,
    "toefl": 6,
    "gre": 7,
}


async def prewarm_video_notes(db: AsyncSession, video_id: str) -> int:
    """Batch-generate AI learning notes for a video's exam-tagged words.

    Reads ``Subtitle.word_levels`` (populated by the annotating step),
    builds a deduplicated batch of (word, level, context_sentence), calls
    the AI service to generate notes in bulk, and upserts them as
    ``video:{id}`` source rows.

    Returns the number of notes generated.  Raises on AI failure so the
    caller can decide whether to fail the pipeline or skip gracefully.
    """
    from sqlalchemy import select

    from app.core.logging import get_logger
    from app.models.subtitle import Subtitle
    from app.services.ai_service import get_ai_service

    logger = get_logger(__name__)

    result = await db.execute(select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index))
    subs = list(result.scalars().all())

    # Build the (word, translation, context_sentence) batch from word_levels;
    # one representative sentence per word, per its highest ECDICT level.
    seen: dict[tuple[str, str], dict] = {}
    for s in subs:
        if not s.word_levels:
            continue
        for surface, levels in s.word_levels.items():
            top = max(levels, key=lambda lv: _EXAM_LEVEL_PRIORITY.get(lv, 0)) if levels else "global"
            key = (surface, top)
            if key not in seen:
                seen[key] = {
                    "word": surface,
                    "level": top,
                    "context_sentence": s.text_en or "",
                }

    items = list(seen.values())
    if not items:
        logger.info("Video %s: no exam words to prewarm", video_id)
        return 0

    ai = get_ai_service()
    source = _video_source(video_id)
    notes = await ai.generate_word_notes_bulk(items, source=source)
    await upsert_notes(db, notes)
    logger.info("Video %s: prewarmed %d video-specific notes", video_id, len(notes))
    return len(notes)
