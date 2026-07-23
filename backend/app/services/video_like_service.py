"""Video like (engagement) service - toggle like + auto-feature.

Extracted from `community_service.py` (ADR-0012) so the social community can be
deleted without touching the watch-page like button. `VideoLike` lives in
`models/engagement.py`; the recommendation system reads `Video.like_count` /
`Video.is_featured` which this service maintains.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.engagement import VideoLike
from app.models.video import Video

# Videos whose like_count OR favorite_count >= this threshold are auto-featured.
FEATURE_THRESHOLD = 10


async def toggle_video_like(db: AsyncSession, user_id: str, video_id: str) -> dict:
    """Toggle like on a video. Returns {"liked": bool}.

    Auto-features the video if like_count or favorite_count reaches
    FEATURE_THRESHOLD. Uses row-level locking + atomic SQL increment/decrement
    to prevent race conditions. Lock the Video row FIRST, then check like.
    """
    video_result = await db.execute(select(Video).where(Video.id == video_id).with_for_update())
    video = video_result.scalar_one_or_none()
    if video is None:
        raise ValueError("Video not found")

    result = await db.execute(select(VideoLike).where(VideoLike.user_id == user_id, VideoLike.video_id == video_id))
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        video.like_count = max(0, video.like_count - 1)
        await db.commit()
        return {"liked": False}
    else:
        like = VideoLike(user_id=user_id, video_id=video_id)
        db.add(like)
        video.like_count += 1
        # Auto-feature check
        if video.like_count >= FEATURE_THRESHOLD or video.favorite_count >= FEATURE_THRESHOLD:
            video.is_featured = True
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            if "uq_video_like" in str(exc):
                return {"liked": True}
            raise
        return {"liked": True}


async def get_video_like_status(db: AsyncSession, user_id: str, video_id: str) -> dict:
    """Check if the current user has liked a video. Returns {"is_liked": bool}."""
    result = await db.execute(select(VideoLike).where(VideoLike.user_id == user_id, VideoLike.video_id == video_id))
    existing = result.scalar_one_or_none()
    return {"is_liked": existing is not None}
