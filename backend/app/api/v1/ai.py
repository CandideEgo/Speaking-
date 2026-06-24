from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_pro_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.learning import LearningRecord, Vocabulary
from app.models.user import User
from app.services.ai_service import get_ai_service
from app.services.speaking_service import get_user_stats

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/word-lookup")
@rate_limit("20/minute")
async def word_lookup(
    request: Request,
    word: str,
    sentence: str,
    current_user: User = Depends(require_pro_user),
    _db: AsyncSession = Depends(get_db),
):
    ai = get_ai_service()
    meaning = await ai.word_context_meaning(word, sentence)
    return {"word": word, "meaning": meaning, "sentence": sentence}


@router.get("/assistant/summary")
@rate_limit("10/minute")
async def assistant_summary(
    request: Request,
    current_user: User = Depends(require_pro_user),
    db: AsyncSession = Depends(get_db),
):
    """AI-generated daily learning summary with trend context."""
    # Get weekly stats with trend data
    stats = await get_user_stats(db, current_user.id, period="week")

    vocab_count = await db.execute(select(func.count(Vocabulary.id)).where(Vocabulary.user_id == current_user.id))
    stats["vocabulary_count"] = vocab_count.scalar() or 0

    records_count = await db.execute(
        select(func.count(LearningRecord.id)).where(LearningRecord.user_id == current_user.id)
    )
    stats["videos_watched"] = records_count.scalar() or 0

    # Add user level for context
    stats["current_level"] = current_user.level or "B1"

    ai = get_ai_service()
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
    """AI recommends what to learn next — enhanced with semantic video info."""
    records_result = await db.execute(select(LearningRecord).where(LearningRecord.user_id == current_user.id).limit(10))
    records = records_result.scalars().all()

    # Build richer history summary with video titles instead of raw IDs
    from app.models.video import Video

    history_parts = []
    for r in records[:5]:
        video_result = await db.execute(select(Video.title).where(Video.id == r.video_id))
        title = video_result.scalar() or f"video-{r.video_id[:8]}"
        progress = f"{r.speaking_attempts} attempts, {round(r.progress_percentage)}% done"
        history_parts.append(f"{title} ({progress})")

    history = "; ".join(history_parts) if history_parts else "new user"

    ai = get_ai_service()
    recommendation = await ai.assistant_recommend(current_user.level or "B1", history)
    return {"recommendation": recommendation, "level": current_user.level}
