import json
from datetime import UTC, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.learning import Vocabulary
from app.models.user import User
from app.schemas.vocabulary import (
    QuizGenerateRequest,
    QuizQuestionResponse,
    QuizSubmitRequest,
    QuizSubmitResponse,
    VocabularyEnrichResponse,
    VocabularyResponse,
    VocabularyStatsResponse,
)
from app.services import vocabulary_service
from app.services.sr_service import calculate_next_review

router = APIRouter(prefix="/vocabulary", tags=["vocabulary"])


# ── Redis-backed quiz storage ──


async def _save_quiz(user_id: str, quiz_data: dict):
    from app.core.redis import get_redis

    redis = get_redis()
    await redis.setex(f"vocab_quiz:{user_id}", 600, json.dumps(quiz_data))  # 10 min TTL


async def _load_quiz(user_id: str) -> dict | None:
    from app.core.redis import get_redis

    redis = get_redis()
    data = await redis.get(f"vocab_quiz:{user_id}")
    return json.loads(data) if data else None


async def _delete_quiz(user_id: str):
    from app.core.redis import get_redis

    redis = get_redis()
    await redis.delete(f"vocab_quiz:{user_id}")


# ── Static-path routes (must come before /{word_id} to avoid path collision) ──


@router.get("/stats", response_model=VocabularyStatsResponse)
@rate_limit("30/minute")
async def vocabulary_stats(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get vocabulary statistics by mastery level."""
    return await vocabulary_service.get_stats(db, current_user.id)


@router.post("/quiz", response_model=list[QuizQuestionResponse])
@rate_limit("5/minute")
async def generate_quiz(
    request: Request,
    body: QuizGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a vocabulary quiz."""
    # Service returns questions WITH correct_answer_index for scoring
    questions = await vocabulary_service.generate_quiz(
        db=db,
        user_id=current_user.id,
        quiz_type=body.quiz_type,
        count=body.count,
        due_only=body.due_only,
    )

    # Store full questions (with answers) in Redis for later submission scoring
    quiz_data = {q["id"]: q for q in questions}
    await _save_quiz(current_user.id, quiz_data)

    # Return questions WITHOUT correct_answer_index to the client
    return [
        QuizQuestionResponse(
            id=q["id"],
            word=q["word"],
            quiz_type=q["quiz_type"],
            question=q["question"],
            options=q.get("options"),
            correct_answer_index=None,
        )
        for q in questions
    ]


@router.post("/quiz/submit", response_model=QuizSubmitResponse)
@rate_limit("10/minute")
async def submit_quiz(
    request: Request,
    body: QuizSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit quiz answers and get scored results."""
    # Load stored questions from Redis for this user
    quiz_data = await _load_quiz(current_user.id)
    if not quiz_data:
        raise HTTPException(status_code=400, detail="No active quiz found. Please generate a quiz first.")

    # Collect stored questions using server-stored correct answers
    questions = []
    for ans in body.answers:
        q = quiz_data.get(ans.question_id)
        if q:
            questions.append(q)

    result = await vocabulary_service.submit_quiz(
        db=db,
        user_id=current_user.id,
        answers=[a.model_dump() for a in body.answers],
        questions=questions,
    )

    # Clean up stored quiz from Redis
    await _delete_quiz(current_user.id)

    return result


# ── Dynamic-path routes ──


@router.post("", status_code=status.HTTP_201_CREATED)
@rate_limit("20/minute")
async def add_word(
    request: Request,
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
@rate_limit("30/minute")
async def list_vocabulary(
    request: Request,
    due_only: bool = Query(False, description="Only show words due for review"),
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List vocabulary words. Optionally filter to only due words."""
    now = datetime.now(UTC)
    stmt = select(Vocabulary).where(Vocabulary.user_id == current_user.id)

    if due_only:
        stmt = stmt.where((Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now))

    stmt = stmt.order_by(Vocabulary.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    words = result.scalars().all()

    # Count stats
    total_result = await db.execute(select(func.count(Vocabulary.id)).where(Vocabulary.user_id == current_user.id))
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
                "definition": w.definition,
                "translation": w.translation,
                "part_of_speech": w.part_of_speech,
                "ipa": w.ipa,
                "example_sentences": w.example_sentences,
                "collocations": w.collocations,
                "difficulty_level": w.difficulty_level,
                "mastery_level": w.mastery_level,
                "context_sentence": w.context_sentence,
                "video_id": w.video_id,
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


@router.get("/{word_id}/enrich", response_model=VocabularyEnrichResponse)
@rate_limit("5/minute")
async def enrich_word(
    request: Request,
    word_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger AI enrichment for a vocabulary word."""
    vocab = await vocabulary_service.enrich_word(db, word_id, current_user.id)
    if not vocab:
        raise HTTPException(status_code=404, detail="Word not found")
    if not vocab.definition:
        raise HTTPException(
            status_code=502,
            detail="AI enrichment failed — could not generate word data",
        )
    return vocab


@router.post("/{word_id}/review")
@rate_limit("20/minute")
async def review_word(
    request: Request,
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

    # SM-2 calculation — use persisted ease_factor and interval_days
    current_ef = vocab.ease_factor if vocab.ease_factor else 2.5
    interval_days = vocab.interval_days if vocab.review_count > 0 else 0

    next_interval, new_ef, new_review_count = calculate_next_review(
        quality, vocab.review_count, current_ef, interval_days
    )

    now = datetime.now(UTC)
    vocab.review_count = new_review_count
    vocab.last_reviewed_at = now
    vocab.next_review_at = now + timedelta(days=next_interval)
    vocab.ease_factor = new_ef
    vocab.interval_days = next_interval

    # Update mastery level based on review count
    if new_review_count == 0:
        vocab.mastery_level = "new"
    elif new_review_count <= 2:
        vocab.mastery_level = "learning"
    elif new_review_count <= 5:
        vocab.mastery_level = "reviewing"
    else:
        vocab.mastery_level = "mastered"

    await db.commit()

    return {
        "id": vocab.id,
        "word": vocab.word,
        "next_review_at": vocab.next_review_at.isoformat(),
        "interval_days": next_interval,
        "review_count": vocab.review_count,
    }


@router.delete("/{word_id}")
@rate_limit("20/minute")
async def remove_word(
    request: Request,
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
