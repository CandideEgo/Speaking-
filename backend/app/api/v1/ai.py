from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.user import User
from app.models.learning import SpeakingAttempt, Vocabulary, LearningRecord
from app.services.ai_service import AIService
from app.services.speaking_service import get_user_stats
from app.api.dependencies import get_current_user, require_pro_user
from app.core.limiter import limiter, rate_limit

router = APIRouter(prefix="/ai", tags=["ai"])

_ai_service: AIService | None = None


def _get_ai_service() -> AIService:
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service


@router.post("/word-lookup")
@rate_limit("20/minute")
async def word_lookup(
    request: Request,
    word: str,
    sentence: str,
    current_user: User = Depends(require_pro_user),
    _db: AsyncSession = Depends(get_db),
):
    ai = _get_ai_service()
    meaning = await ai.word_context_meaning(word, sentence)
    return {"word": word, "meaning": meaning, "sentence": sentence}


@router.get("/assistant/summary")
@rate_limit("10/minute")
async def assistant_summary(
    request: Request,
    current_user: User = Depends(require_pro_user),
    db: AsyncSession = Depends(get_db),
):
    """AI-generated daily learning summary."""
    stats = await get_user_stats(db, current_user.id)

    vocab_count = await db.execute(
        select(func.count(Vocabulary.id)).where(Vocabulary.user_id == current_user.id)
    )
    stats["vocabulary_count"] = vocab_count.scalar() or 0

    records_count = await db.execute(
        select(func.count(LearningRecord.id)).where(LearningRecord.user_id == current_user.id)
    )
    stats["videos_watched"] = records_count.scalar() or 0

    ai = _get_ai_service()
    summary = await ai.assistant_daily_summary(stats)

    return {
        "summary": summary,
        "stats": stats,
    }


@router.get("/assistant/recommend")
@rate_limit("10/minute")
async def assistant_recommend(
    request: Request,
    current_user: User = Depends(require_pro_user),
    db: AsyncSession = Depends(get_db),
):
    """AI recommends what to learn next."""
    records_result = await db.execute(
        select(LearningRecord).where(LearningRecord.user_id == current_user.id).limit(10)
    )
    records = records_result.scalars().all()
    history = ", ".join([f"video {r.video_id}" for r in records]) if records else "new user"

    ai = _get_ai_service()
    recommendation = await ai.assistant_recommend(current_user.level or "B1", history)
    return {"recommendation": recommendation, "level": current_user.level}
