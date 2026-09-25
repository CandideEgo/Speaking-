"""Vocabulary enrichment and stats service.

Quiz functionality has been unified into practice_service.build_vocabulary_drill
and practice_service.submit_practice_results.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.learning import Vocabulary
from app.services.ai_service import get_ai_service
from app.services.sr_service import calculate_next_review

logger = logging.getLogger(__name__)


def _get_ai():
    return get_ai_service()


# Mastery level thresholds
MASTERY_NEW = "new"
MASTERY_LEARNING = "learning"
MASTERY_REVIEWING = "reviewing"
MASTERY_MASTERED = "mastered"

# SM-2 quality assigned to a binary (right/wrong) answer. Kept here so the
# drill's session answers and the legacy review endpoint grade identically.
QUALITY_CORRECT = 5
QUALITY_WRONG = 2


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


def apply_review(vocab: Vocabulary, quality: int, now: datetime | None = None) -> tuple[int, datetime]:
    """Apply one SM-2 review to ``vocab`` in place.

    Returns ``(interval_days, next_review_at)`` — the next review time is handed
    back rather than re-read off the model so callers get a non-optional value
    (the column is nullable for words that were never scheduled).

    The single place that mutates a word's review state, so the drill's
    persisted round and ``POST /vocabulary/{id}/review`` can never drift apart.
    Mutates only — the caller owns the commit.

    ``wrong_count`` / ``last_wrong_at`` (DEC-053) are the input S6's interval
    algorithm reads; S3 already records them so no answer is lost when the
    algorithm is swapped.
    """
    now = now or datetime.now(UTC)
    current_ef = vocab.ease_factor if vocab.ease_factor else 2.5
    interval_days = vocab.interval_days if vocab.review_count > 0 else 0

    next_interval, new_ef, new_review_count = calculate_next_review(
        quality, vocab.review_count, current_ef, interval_days
    )

    next_review_at = now + timedelta(days=next_interval)

    vocab.review_count = new_review_count
    vocab.last_reviewed_at = now
    vocab.next_review_at = next_review_at
    vocab.ease_factor = new_ef
    vocab.interval_days = next_interval
    vocab.mastery_level = _mastery_from_review_count(new_review_count)

    if quality >= 3:
        vocab.correct_count = (vocab.correct_count or 0) + 1
    else:
        vocab.wrong_count = (vocab.wrong_count or 0) + 1
        vocab.last_wrong_at = now

    return next_interval, next_review_at


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
    new_count: int,
    review_count: int,
) -> dict:
    """Compose the 今日训练 queue: new words (never reviewed) + due words.

    New words are ``mastery_level == new`` ordered oldest-first so words the
    user saved earliest get learned first; due words are ordered by
    ``next_review_at`` (most overdue first). Mastered words never appear in
    the review queue (tri-state semantics, same as get_stats).

    Both counts are required: the caller resolves them from the user's daily
    quota (``UserLearningProfile.daily_new_target`` / ``daily_review_target``,
    DEC-053) and only overrides them when an explicit request asks for it.
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
