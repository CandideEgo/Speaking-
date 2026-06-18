"""Business logic for vocabulary operations.

Route handlers in api/v1/vocabulary.py delegate to these functions
so HTTP concerns stay separate from domain logic.
"""

from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.learning import Vocabulary
from app.services.sr_service import calculate_next_review


async def add_word(
    db: AsyncSession,
    user_id: str,
    word: str,
    context_sentence: str | None = None,
    video_id: str | None = None,
) -> dict:
    """Add a word to personal vocabulary.

    Raises ValueError if the word already exists for this user.
    """
    normalized = word.strip().lower()

    # Check for duplicates
    existing = await db.execute(
        select(Vocabulary).where(
            Vocabulary.user_id == user_id,
            Vocabulary.word == normalized,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Word already in vocabulary")

    vocab = Vocabulary(
        user_id=user_id,
        word=normalized,
        context_sentence=context_sentence,
        video_id=video_id,
    )
    db.add(vocab)
    await db.commit()
    await db.refresh(vocab)

    return {
        "id": vocab.id,
        "word": vocab.word,
        "context_sentence": vocab.context_sentence,
        "created_at": vocab.created_at.isoformat(),
    }


async def list_vocabulary(
    db: AsyncSession,
    user_id: str,
    due_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """List vocabulary words with stats. Optionally filter to only due words."""
    now = datetime.now(timezone.utc)
    offset = (page - 1) * page_size

    stmt = select(Vocabulary).where(Vocabulary.user_id == user_id)

    if due_only:
        stmt = stmt.where(
            (Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now)
        )

    stmt = stmt.order_by(Vocabulary.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(stmt)
    words = result.scalars().all()

    # Count stats
    total_result = await db.execute(
        select(func.count(Vocabulary.id)).where(Vocabulary.user_id == user_id)
    )
    total = total_result.scalar() or 0

    due_count_result = await db.execute(
        select(func.count(Vocabulary.id)).where(
            Vocabulary.user_id == user_id,
            (Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now),
        )
    )
    due_count = due_count_result.scalar() or 0

    return {
        "items": [
            {
                "id": w.id,
                "word": w.word,
                "context_sentence": w.context_sentence,
                "review_count": w.review_count,
                "next_review_at": w.next_review_at.isoformat() if w.next_review_at else None,
                "created_at": w.created_at.isoformat(),
            }
            for w in words
        ],
        "page": page,
        "page_size": page_size,
        "has_more": total > page * page_size,
        "stats": {
            "total": total,
            "due": due_count,
        },
    }


async def review_word(
    db: AsyncSession,
    word_id: str,
    user_id: str,
    quality: int,
) -> dict:
    """Record a review of a word with SM-2 spaced repetition.

    Raises ValueError if the word is not found.
    """
    result = await db.execute(
        select(Vocabulary).where(
            Vocabulary.id == word_id,
            Vocabulary.user_id == user_id,
        )
    )
    vocab = result.scalar_one_or_none()
    if not vocab:
        raise ValueError("Word not found")

    # SM-2 calculation
    current_interval = (vocab.next_review_at - vocab.created_at).days if vocab.next_review_at else 0
    if current_interval < 0:
        current_interval = 0

    # Use default ease factor and interval for new words
    ef = 2.5
    if vocab.review_count > 0 and vocab.last_reviewed_at and vocab.next_review_at:
        interval_days = (vocab.next_review_at - vocab.last_reviewed_at).days
        if interval_days < 1:
            interval_days = 1
        # Approximate EF (we don't store it, so use default)
        ef = 2.5
    else:
        interval_days = 0

    next_interval, new_ef, new_review_count = calculate_next_review(
        quality, vocab.review_count, ef, interval_days
    )

    now = datetime.now(timezone.utc)
    vocab.review_count = new_review_count
    vocab.last_reviewed_at = now
    vocab.next_review_at = now + timedelta(days=next_interval)

    await db.commit()

    return {
        "id": vocab.id,
        "word": vocab.word,
        "next_review_at": vocab.next_review_at.isoformat(),
        "interval_days": next_interval,
        "review_count": vocab.review_count,
    }


async def remove_word(
    db: AsyncSession,
    word_id: str,
    user_id: str,
) -> None:
    """Remove a word from vocabulary.

    Raises ValueError if the word is not found.
    """
    result = await db.execute(
        select(Vocabulary).where(
            Vocabulary.id == word_id,
            Vocabulary.user_id == user_id,
        )
    )
    vocab = result.scalar_one_or_none()
    if not vocab:
        raise ValueError("Word not found")

    await db.delete(vocab)
    await db.commit()
