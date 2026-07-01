"""Vocabulary enrichment, quiz, and stats service."""

import json
import logging
from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.learning import Vocabulary
from app.services.ai_service import get_ai_service
from app.services.sr_service import calculate_next_review

logger = logging.getLogger(__name__)

ai = get_ai_service()

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


async def enrich_word(db: AsyncSession, vocabulary_id: str, user_id: str) -> Vocabulary:
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

    # Call AI enrichment
    enriched = await ai.enrich_vocabulary_word(vocab.word, vocab.context_sentence)

    # Persist enrichment results
    vocab.definition = enriched.get("definition", "")
    vocab.translation = enriched.get("translation", "")
    vocab.part_of_speech = enriched.get("part_of_speech", "")
    vocab.ipa = enriched.get("ipa", "")
    vocab.example_sentences = enriched.get("example_sentences", [])
    vocab.collocations = enriched.get("collocations", [])
    vocab.difficulty_level = enriched.get("difficulty_level", "B1")

    await commit_refresh(db, vocab)
    return vocab


async def generate_quiz(
    db: AsyncSession,
    user_id: str,
    quiz_type: str,
    count: int = 10,
    due_only: bool = False,
) -> list[dict]:
    """Generate a vocabulary quiz for the user.

    Args:
        db: database session
        user_id: current user id
        quiz_type: one of multiple_choice, spelling, context_fill, translation
        count: number of questions (1-30)
        due_only: if True, only include words due for review

    Returns:
        list of quiz question dicts (includes correct_answer_index for scoring)
    """
    now = datetime.now(UTC)
    stmt = select(Vocabulary).where(Vocabulary.user_id == user_id)

    if due_only:
        stmt = stmt.where((Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now))

    # Prefer words that have been enriched (have definition/translation)
    stmt = stmt.order_by(Vocabulary.created_at.desc()).limit(count * 3)
    result = await db.execute(stmt)
    words = result.scalars().all()

    if not words:
        return []

    # Take up to `count` words, preferring enriched ones
    enriched_words = [w for w in words if w.definition and w.translation]
    if len(enriched_words) >= count:
        selected = enriched_words[:count]
    else:
        # Fill with unenriched words
        unenriched = [w for w in words if not (w.definition and w.translation)]
        selected = (enriched_words + unenriched)[:count]

    # Build word dicts for AI quiz generation
    word_dicts = [
        {
            "word": w.word,
            "definition": w.definition or "",
            "translation": w.translation or "",
        }
        for w in selected
    ]

    questions = await ai.generate_vocab_quiz(word_dicts, quiz_type)
    return questions


async def submit_quiz(
    db: AsyncSession,
    user_id: str,
    answers: list[dict],
    questions: list[dict],
) -> dict:
    """Score quiz answers and update SM-2 review for each word.

    Args:
        db: database session
        user_id: current user id
        answers: list of {question_id, answer}
        questions: original questions with correct_answer_index (stored temporarily)

    Returns:
        QuizSubmitResponse dict: {score, total, results}
    """
    # Build lookup: question_id -> user answer
    answer_map = {ans["question_id"]: ans["answer"] for ans in answers}

    score = 0
    results = []
    now = datetime.now(UTC)

    # Iterate ALL stored questions so unanswered ones count as incorrect
    # (prevents score inflation by skipping hard questions).
    for q in questions:
        qid = q["id"]
        quiz_type = q["quiz_type"]
        word = q["word"]
        user_answer = answer_map.get(qid)

        # Determine correct answer based on quiz type
        if quiz_type == "multiple_choice" or quiz_type == "translation" or quiz_type == "context_fill":
            correct_index = q.get("correct_answer_index", 0)
            options = q.get("options", [])
            correct_answer = options[correct_index] if options and correct_index < len(options) else ""
            is_correct = user_answer is not None and user_answer.strip().lower() == correct_answer.strip().lower()
        elif quiz_type == "spelling":
            correct_answer = word
            is_correct = user_answer is not None and user_answer.strip().lower() == correct_answer.strip().lower()
        else:
            correct_answer = ""
            is_correct = False

        if is_correct:
            score += 1

        results.append(
            {
                "question_id": qid,
                "correct": is_correct,
                "correct_answer": correct_answer,
                "user_answer": user_answer if user_answer is not None else "",
            }
        )

        # Update SM-2 review for this word (unanswered -> quality 2, same as wrong)
        quality = 5 if is_correct else 2
        await _update_word_review(db, user_id, word, quality, now)

    await db.commit()

    return {
        "score": score,
        "total": len(questions),
        "results": results,
    }


async def _update_word_review(db: AsyncSession, user_id: str, word: str, quality: int, now: datetime) -> None:
    """Update SM-2 review data for a single word."""
    result = await db.execute(
        select(Vocabulary).where(
            Vocabulary.user_id == user_id,
            Vocabulary.word == word,
        )
    )
    vocab = result.scalar_one_or_none()
    if not vocab:
        return

    # Use persisted ease_factor (default 2.5 for new words)
    current_ef = vocab.ease_factor if vocab.ease_factor else 2.5

    # Calculate current interval from persisted value
    if vocab.review_count > 0 and vocab.last_reviewed_at and vocab.next_review_at:
        interval_days = max((vocab.next_review_at - vocab.last_reviewed_at).days, 1)
    else:
        interval_days = 0

    next_interval, new_ef, new_review_count = calculate_next_review(
        quality, vocab.review_count, current_ef, interval_days
    )

    vocab.review_count = new_review_count
    vocab.last_reviewed_at = now
    vocab.next_review_at = now + timedelta(days=next_interval)
    vocab.ease_factor = new_ef
    vocab.interval_days = next_interval
    vocab.mastery_level = _mastery_from_review_count(new_review_count)


async def get_stats(db: AsyncSession, user_id: str) -> dict:
    """Aggregate vocabulary statistics by mastery level."""
    now = datetime.now(UTC)

    # Count by mastery_level
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

    # Count due words
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
