"""Vocabulary enrichment and stats service.

Quiz functionality has been unified into practice_service.build_vocabulary_drill
and practice_service.submit_practice_results.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.learning import Vocabulary
from app.services.ai_service import get_ai_service

logger = logging.getLogger(__name__)


def _get_ai():
    return get_ai_service()


# Mastery level thresholds
MASTERY_NEW = "new"
MASTERY_LEARNING = "learning"
MASTERY_REVIEWING = "reviewing"
MASTERY_MASTERED = "mastered"


def _mastery_from_review_count(review_count: int) -> str:
    """Determine mastery level from review count."""
    if review_count == 0:
        return MASTERY_NEW
    elif review_count <= 2:
        return MASTERY_LEARNING
    elif review_count <= 5:
        return MASTERY_REVIEWING
    else:
        return MASTERY_MASTERED


async def enrich_word(db: AsyncSession, vocabulary_id: str, user_id: str) -> Vocabulary | None:
    """Fetch a word from DB, call AI enrichment, persist results, return enriched word."""
    result = await db.execute(
        select(Vocabulary).where(
            Vocabulary.id == vocabulary_id,
            Vocabulary.user_id == user_id,
        )
    )
    vocab = result.scalar_one_or_none()
    if not vocab:
        return None

    enriched = await _get_ai().enrich_vocabulary_word(vocab.word, vocab.context_sentence)

    vocab.definition = enriched.get("definition", "")
    vocab.translation = enriched.get("translation", "")
    vocab.part_of_speech = enriched.get("part_of_speech", "")
    vocab.ipa = enriched.get("ipa", "")
    vocab.example_sentences = enriched.get("example_sentences", [])
    vocab.collocations = enriched.get("collocations", [])
    vocab.difficulty_level = enriched.get("difficulty_level", "B1")

    await commit_refresh(db, vocab)
    return vocab


async def get_stats(db: AsyncSession, user_id: str) -> dict:
    """Aggregate vocabulary statistics by mastery level."""
    now = datetime.now(UTC)

    stmt = (
        select(
            Vocabulary.mastery_level,
            func.count(Vocabulary.id),
        )
        .where(Vocabulary.user_id == user_id)
        .group_by(Vocabulary.mastery_level)
    )
    result = await db.execute(stmt)
    level_counts = dict(result.all())

    due_stmt = select(func.count(Vocabulary.id)).where(
        Vocabulary.user_id == user_id,
        (Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now),
    )
    due_result = await db.execute(due_stmt)
    due_count = due_result.scalar() or 0

    total = sum(level_counts.values())

    return {
        "total": total,
        "new_count": level_counts.get(MASTERY_NEW, 0),
        "learning_count": level_counts.get(MASTERY_LEARNING, 0),
        "reviewing_count": level_counts.get(MASTERY_REVIEWING, 0),
        "mastered_count": level_counts.get(MASTERY_MASTERED, 0),
        "due_count": due_count,
    }
