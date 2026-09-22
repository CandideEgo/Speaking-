from datetime import UTC, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import commit_refresh, get_db
from app.core.limiter import rate_limit
from app.models.learning import Vocabulary
from app.models.user import User
from app.schemas.pagination import PaginatedResponse, PaginationParams, paginated
from app.schemas.vocabulary import (
    VocabularyEnrichResponse,
    VocabularyResponse,
    VocabularyStatsResponse,
)
from app.services import practice_service, vocabulary_service
from app.services.sr_service import calculate_next_review

router = APIRouter(prefix="/vocabulary", tags=["vocabulary"])


# ---------------------------------------------------------------------------
# Schemas for unified practice submit
# ---------------------------------------------------------------------------


class VocabPracticeResultItem(BaseModel):
    word: str
    correct: bool


class VocabPracticeSubmitRequest(BaseModel):
    results: list[VocabPracticeResultItem]


class VocabPracticeSubmitResponse(BaseModel):
    updated: int
    auto_added: int


# ---------------------------------------------------------------------------
# Static-path routes (must come before /{word_id} to avoid path collision)
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=VocabularyStatsResponse)
@rate_limit("30/minute")
async def vocabulary_stats(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get vocabulary statistics by mastery level."""
    return await vocabulary_service.get_stats(db, current_user.id)


@router.get("/daily-session")
@rate_limit("30/minute")
async def get_daily_session(
    request: Request,
    new_count: int = Query(15, ge=1, le=50),
    review_count: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """今日训练队列：新词（从未复习）+ 到期复习词，附总量统计。

    Powers the Baicizhan-style /vocabulary home + /vocabulary/drill two-phase
    flow (learn flashcards, then due review quiz).
    """
    session = await vocabulary_service.build_daily_session(db, current_user.id, new_count, review_count)
    return {
        "new_words": [VocabularyResponse.model_validate(w) for w in session["new_words"]],
        "review_words": [VocabularyResponse.model_validate(w) for w in session["review_words"]],
        "totals": session["totals"],
    }


@router.get("/practice")
@rate_limit("10/minute")
async def get_vocabulary_practice(
    request: Request,
    level: str | None = Query(None, description="Target exam level key"),
    count: int = Query(10, ge=1, le=30),
    due_only: bool = Query(False, description="Only include words due for review"),
    video_id: str | None = Query(None, description="Restrict drill to words from this video (D3b)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate adaptive practice items from the user's vocabulary list.

    Item types are chosen based on each word's SM-2 mastery level.
    All grading is client-side. When ``video_id`` is set, the candidate pool
    is restricted to that video's words and each item carries
    ``video_id`` / ``subtitle_id`` / ``start_time`` for the EndScreen's
    "复习本视频生词" deep link.
    """
    try:
        items = await practice_service.build_vocabulary_drill(db, current_user.id, level, count, due_only, video_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    return {"items": items}


@router.post("/practice/submit", response_model=VocabPracticeSubmitResponse)
@rate_limit("10/minute")
async def submit_vocabulary_practice(
    request: Request,
    body: VocabPracticeSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Batch-submit vocabulary practice results and update SM-2 for each word.

    Words not yet in the user's vocabulary are auto-added.
    """
    try:
        result = await practice_service.submit_practice_results(
            db,
            current_user.id,
            [r.model_dump() for r in body.results],
            video_id=None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交失败：{e}") from e

    return VocabPracticeSubmitResponse(**result)


# ---------------------------------------------------------------------------
# Dynamic-path routes
# ---------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_201_CREATED)
@rate_limit("20/minute")
async def add_word(
    request: Request,
    word: str,
    context_sentence: str | None = None,
    video_id: str | None = None,
    subtitle_id: str | None = Query(None, description="Source subtitle for D3b 回看原句"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a word to personal vocabulary."""
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
        subtitle_id=subtitle_id,
    )
    db.add(vocab)
    await commit_refresh(db, vocab)

    return {
        "id": vocab.id,
        "word": vocab.word,
        "context_sentence": vocab.context_sentence,
        "video_id": vocab.video_id,
        "subtitle_id": vocab.subtitle_id,
        "created_at": vocab.created_at.isoformat(),
    }


@router.get("", response_model=PaginatedResponse[VocabularyResponse])
@rate_limit("30/minute")
async def list_vocabulary(
    request: Request,
    due_only: bool = Query(False, description="Only show words due for review"),
    mastery: str | None = Query(
        None,
        description="Comma-separated mastery levels to include (new/learning/reviewing/mastered)",
    ),
    q: str | None = Query(
        None,
        description="Search word/translation/definition (case-insensitive substring)",
    ),
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List vocabulary words with server-side filters + pagination.

    Filters (due_only / mastery / q) compose; all apply to both the page
    query and the total count so the pager stays correct. Stats
    (total/due/mastery) live in ``GET /vocabulary/stats``.
    """
    now = datetime.now(UTC)
    # Mastered words have exited the review loop (tri-state semantics) and
    # never appear in due queues, whatever next_review_at says.
    due_filter = ((Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now)) & (
        Vocabulary.mastery_level != "mastered"
    )

    stmt = select(Vocabulary).where(Vocabulary.user_id == current_user.id)
    count_stmt = select(func.count(Vocabulary.id)).where(Vocabulary.user_id == current_user.id)
    if due_only:
        stmt = stmt.where(due_filter)
        count_stmt = count_stmt.where(due_filter)
    if mastery:
        # Same comma-separated convention as GET /vocabulary/words.
        levels = [lv.strip() for lv in mastery.split(",") if lv.strip()]
        if levels:
            stmt = stmt.where(Vocabulary.mastery_level.in_(levels))
            count_stmt = count_stmt.where(Vocabulary.mastery_level.in_(levels))
    if q and q.strip():
        like = f"%{q.strip()}%"
        search_filter = or_(
            Vocabulary.word.ilike(like),
            Vocabulary.translation.ilike(like),
            Vocabulary.definition.ilike(like),
        )
        stmt = stmt.where(search_filter)
        count_stmt = count_stmt.where(search_filter)

    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(Vocabulary.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)
    words = (await db.execute(stmt)).scalars().all()

    items = [VocabularyResponse.model_validate(w) for w in words]
    return paginated(items, pagination, total=total)


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

    if new_review_count == 0:
        vocab.mastery_level = "new"
    elif new_review_count <= 2:
        vocab.mastery_level = "learning"
    elif new_review_count <= 5:
        vocab.mastery_level = "reviewing"
    else:
        vocab.mastery_level = "mastered"

    await db.commit()

    # Emit learning event (ADR-0012 learning plan integration)
    try:
        from app.services.learning_event_service import EVENT_REVIEWED_WORDS, emit_event

        await emit_event(db, current_user.id, EVENT_REVIEWED_WORDS, 1)
        # Update correct_count
        if quality >= 3:
            vocab.correct_count = (vocab.correct_count or 0) + 1
        await db.commit()
    except Exception:
        pass  # Non-blocking

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


@router.get("/words")
@rate_limit("30/minute")
async def list_learning_words(
    request: Request,
    mastery: str = Query(
        "learning,reviewing",
        description="Comma-separated mastery levels to include",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight endpoint returning just word strings for the user's vocabulary.

    Used by the watch page to highlight words the user is actively learning
    in subtitle text (Sprint 3 vocab recurrence UI). Returns only the word
    strings — no full Vocabulary objects — to minimize payload.
    """
    levels = [lv.strip() for lv in mastery.split(",") if lv.strip()]
    if not levels:
        levels = ["learning", "reviewing"]

    result = await db.execute(
        select(Vocabulary.word).where(
            Vocabulary.user_id == current_user.id,
            Vocabulary.mastery_level.in_(levels),
        )
    )
    words = [w.lower() for w in result.scalars().all()]
    return {"words": words}
