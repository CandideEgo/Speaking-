from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_pro_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.learning import LearningRecord, Vocabulary
from app.models.user import User
from app.services.ai_service import get_ai_service

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
    """AI-generated daily learning summary.

    Built from real vocab/watch data. Speaking metrics were removed with AI
    scoring (ADR-0002) and are no longer surfaced here.
    """
    vocab_count = await db.execute(select(func.count(Vocabulary.id)).where(Vocabulary.user_id == current_user.id))
    records_count = await db.execute(
        select(func.count(LearningRecord.id)).where(LearningRecord.user_id == current_user.id)
    )

    stats = {
        "vocabulary_count": vocab_count.scalar() or 0,
        "videos_watched": records_count.scalar() or 0,
        "current_level": current_user.level or "B1",
    }

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

    # Batch-fetch video titles (fixes N+1 — was one query per record)
    video_ids = [r.video_id for r in records[:5]]
    video_map: dict[str, str] = {}
    if video_ids:
        vid_result = await db.execute(select(Video.id, Video.title).where(Video.id.in_(video_ids)))
        video_map = {vid: title for vid, title in vid_result.all()}

    history_parts = []
    for r in records[:5]:
        title = video_map.get(r.video_id) or f"video-{r.video_id[:8]}"
        progress = f"{r.speaking_attempts} attempts, {round(r.progress_percentage)}% done"
        history_parts.append(f"{title} ({progress})")

    history = "; ".join(history_parts) if history_parts else "new user"

    ai = get_ai_service()
    recommendation = await ai.assistant_recommend(current_user.level or "B1", history)
    return {"recommendation": recommendation, "level": current_user.level}
