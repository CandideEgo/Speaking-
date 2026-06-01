from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.user import User
from app.models.learning import SpeakingAttempt, Vocabulary, LearningRecord
from app.services.ai_service import AIService
from app.services.speaking_service import get_user_stats
from app.api.dependencies import get_current_user
from app.core.limiter import limiter

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/word-lookup")
@limiter.limit("20/minute")
async def word_lookup(
    word: str,
    sentence: str,
    current_user: User = Depends(get_current_user),
    _db: AsyncSession = Depends(get_db),
):
    if current_user.plan.value == "free":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Word lookup with AI requires Pro subscription.",
        )

    ai = AIService()
    meaning = await ai.word_context_meaning(word, sentence)
    return {"word": word, "meaning": meaning, "sentence": sentence}


@router.get("/assistant/summary")
@limiter.limit("10/minute")
async def assistant_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI-generated daily learning summary."""
    if current_user.plan.value == "free":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI assistant requires Pro subscription.",
        )

    stats = await get_user_stats(db, current_user.id)

    # Additional stats
    vocab_count = await db.execute(
        select(func.count(Vocabulary.id)).where(Vocabulary.user_id == current_user.id)
    )
    stats["vocabulary_count"] = vocab_count.scalar() or 0

    records_count = await db.execute(
        select(func.count(LearningRecord.id)).where(LearningRecord.user_id == current_user.id)
    )
    stats["videos_watched"] = records_count.scalar() or 0

    ai = AIService()
    summary = await ai.assistant_daily_summary(stats)

    return {
        "summary": summary,
        "stats": stats,
    }


@router.get("/assistant/recommend")
@limiter.limit("10/minute")
async def assistant_recommend(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI recommends what to learn next."""
    if current_user.plan.value == "free":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI assistant requires Pro subscription.",
        )

    # Gather recent video titles
    records_result = await db.execute(
        select(LearningRecord).where(LearningRecord.user_id == current_user.id).limit(10)
    )
    records = records_result.scalars().all()
    history = ", ".join([f"video {r.video_id}" for r in records]) if records else "new user"

    ai = AIService()
    recommendation = await ai.assistant_recommend(current_user.level or "B1", history)
    return {"recommendation": recommendation, "level": current_user.level}
