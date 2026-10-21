"""Persist watch position without confusing it with learning mastery."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.core.errors import NotFoundError
from app.models.learning import LearningRecord
from app.models.video import Video


async def save_position(db: AsyncSession, user_id: str, video_id: str, position: float) -> LearningRecord:
    video = await db.get(Video, video_id)
    if video is None:
        raise NotFoundError("视频不存在")
    if video.duration and video.duration > 0:
        position = min(position, float(video.duration))

    stmt = (
        select(LearningRecord)
        .where(LearningRecord.user_id == user_id, LearningRecord.video_id == video_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    record = (await db.execute(stmt)).scalar_one_or_none()
    if record is None:
        try:
            # Add INSIDE the savepoint: begin_nested flushes pending changes.
            async with db.begin_nested():
                record = LearningRecord(user_id=user_id, video_id=video_id)
                db.add(record)
                await db.flush()
        except IntegrityError:
            # A concurrent first view/save may have won the unique insert.
            record = (await db.execute(stmt)).scalar_one_or_none()
            if record is None:
                raise

    # Apply to both the normal path and the concurrent-creation path.
    record.position_seconds = position
    record.last_accessed_at = datetime.now(UTC)
    if video.duration and video.duration > 0:
        record.progress_percentage = round(min(100, position / video.duration * 100), 1)
    await commit_refresh(db, record)
    return record
