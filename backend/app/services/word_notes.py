"""Pre-generated AI word notes: read / write helpers for the gloss endpoint.

Provides:
  * ``get_note``         — fetch a single (word, source) row
  * ``get_best_note``   — video-specific first, then ``global`` fallback;
                          returns a plain dict ready for the gloss response
  * ``upsert_notes``    — write a batch of (word, level, source) rows
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
