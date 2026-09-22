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

    # Mastered words have exited review (tri-state semantics) and don't
    # count toward the due queue.
    due_stmt = select(func.count(Vocabulary.id)).where(
        Vocabulary.user_id == user_id,
        (Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now),
        Vocabulary.mastery_level != MASTERY_MASTERED,
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


async def build_daily_session(
    db: AsyncSession,
    user_id: str,
    new_count: int = 15,
    review_count: int = 20,
) -> dict:
    """Compose the 今日训练 queue: new words (never reviewed) + due words.

    New words are ``mastery_level == new`` ordered oldest-first so words the
    user saved earliest get learned first; due words are ordered by
    ``next_review_at`` (most overdue first). Mastered words never appear in
    the review queue (tri-state semantics, same as get_stats).
    """
    now = datetime.now(UTC)

    new_stmt = (
        select(Vocabulary)
        .where(Vocabulary.user_id == user_id, Vocabulary.mastery_level == MASTERY_NEW)
        .order_by(Vocabulary.created_at.asc())
        .limit(new_count)
    )
    new_words = (await db.execute(new_stmt)).scalars().all()

    review_stmt = (
        select(Vocabulary)
        .where(
            Vocabulary.user_id == user_id,
            (Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now),
            Vocabulary.mastery_level != MASTERY_MASTERED,
            Vocabulary.mastery_level != MASTERY_NEW,
        )
        .order_by(Vocabulary.next_review_at.asc().nulls_first())
        .limit(review_count)
    )
    review_words = (await db.execute(review_stmt)).scalars().all()

    new_total = (
        await db.execute(
            select(func.count(Vocabulary.id)).where(
                Vocabulary.user_id == user_id,
                Vocabulary.mastery_level == MASTERY_NEW,
            )
        )
    ).scalar() or 0
    # Due total mirrors the review queue: new words are the *learn* queue, not
    # review (differs from stats.due_count, which folds new words into the
    # badge number).
    due_total = (
        await db.execute(
            select(func.count(Vocabulary.id)).where(
                Vocabulary.user_id == user_id,
                (Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now),
                Vocabulary.mastery_level != MASTERY_MASTERED,
                Vocabulary.mastery_level != MASTERY_NEW,
            )
        )
    ).scalar() or 0

    return {
        "new_words": new_words,
        "review_words": review_words,
        "totals": {"new_total": new_total, "due_total": due_total},
    }
