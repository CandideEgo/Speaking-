"""Quiz/learning service — video quiz retrieval and score submission."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import check_video_access
from app.models.learning import LearningRecord
from app.models.user import User
from app.models.video import Video


async def get_video_quiz(
    db: AsyncSession,
    video_id: str,
    current_user: User | None,
) -> dict | None:
    """Get quiz questions for a video. Returns None if not found / no access."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        return None
    if not check_video_access(video, current_user):
        return None
    return {
        "video_id": video.id,
        "quiz": video.quiz_data or [],
    }


async def submit_quiz_result(
    db: AsyncSession,
    video_id: str,
    user_id: str,
    score: float,
) -> dict:
    """Submit quiz score and update learning record."""
    # Verify video exists
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        return None

    # Upsert LearningRecord with quiz score
    lr_result = await db.execute(
        select(LearningRecord).where(
            LearningRecord.user_id == user_id,
            LearningRecord.video_id == video_id,
        )
    )
    record = lr_result.scalar_one_or_none()
    if record:
        record.quiz_score = score
        if score >= 60:
            record.completed = True
    else:
        record = LearningRecord(
            user_id=user_id,
            video_id=video_id,
            quiz_score=score,
            completed=score >= 60,
        )
        db.add(record)

    await db.commit()
    return {"success": True, "quiz_score": score}
