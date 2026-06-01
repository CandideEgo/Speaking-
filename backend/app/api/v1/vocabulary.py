from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.user import User
from app.models.learning import Vocabulary
from app.services.sr_service import calculate_next_review
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/vocabulary", tags=["vocabulary"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_word(
    word: str,
    context_sentence: str | None = None,
    video_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a word to personal vocabulary."""
    # Check for duplicates
    existing = await db.execute(
        select(Vocabulary).where(
            Vocabulary.user_id == current_user.id,
            Vocabulary.word == word.strip().lower(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Word already in vocabulary")

    vocab = Vocabulary(
        user_id=current_user.id,
        word=word.strip().lower(),
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


@router.get("")
async def list_vocabulary(
    due_only: bool = Query(False, description="Only show words due for review"),
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List vocabulary words. Optionally filter to only due words."""
    now = datetime.now(timezone.utc)
    stmt = select(Vocabulary).where(Vocabulary.user_id == current_user.id)

    if due_only:
        stmt = stmt.where(
            (Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now)
        )

    stmt = stmt.order_by(Vocabulary.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    words = result.scalars().all()

    # Count stats
    total_result = await db.execute(
        select(func.count(Vocabulary.id)).where(Vocabulary.user_id == current_user.id)
    )
    total = total_result.scalar() or 0

    due_count_result = await db.execute(
        select(func.count(Vocabulary.id)).where(
            Vocabulary.user_id == current_user.id,
            (Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now),
        )
    )
    due_count = due_count_result.scalar() or 0

    return {
        "words": [
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
        "stats": {
            "total": total,
            "due": due_count,
        },
    }


@router.post("/{word_id}/review")
async def review_word(
    word_id: str,
    quality: int = Query(..., ge=0, le=5, description="Self-assessment 0-5"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a review of a word with SM-2 spaced repetition."""
    result = await db.execute(
        select(Vocabulary).where(
            Vocabulary.id == word_id,
            Vocabulary.user_id == current_user.id,
        )
    )
    vocab = result.scalar_one_or_none()
    if not vocab:
        raise HTTPException(status_code=404, detail="Word not found")

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


@router.delete("/{word_id}")
async def remove_word(
    word_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a word from vocabulary."""
    result = await db.execute(
        select(Vocabulary).where(
            Vocabulary.id == word_id,
            Vocabulary.user_id == current_user.id,
        )
    )
    vocab = result.scalar_one_or_none()
    if not vocab:
        raise HTTPException(status_code=404, detail="Word not found")

    await db.delete(vocab)
    await db.commit()
    return {"success": True}
