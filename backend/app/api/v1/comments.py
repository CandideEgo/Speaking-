from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.dependencies import get_current_user, get_optional_user, get_admin_user
from app.models.user import User
from app.models.comment import VideoComment, VideoCommentStats
from app.models.video import Video
from app.services.comment_service import CommentService

router = APIRouter(prefix="/comments", tags=["comments"])


# ---------------------------------------------------------------------------
# Schemas (inline for simplicity; can be moved to schemas/comment.py)
# ---------------------------------------------------------------------------

class CommentResponse:
    def __init__(self, comment: VideoComment):
        self.id = comment.id
        self.video_id = comment.video_id
        self.external_id = comment.external_id
        self.author_name = comment.author_name
        self.text = comment.text
        self.like_count = comment.like_count
        self.reply_count = comment.reply_count
        self.published_at = comment.published_at.isoformat() if comment.published_at else None


class CommentStatsResponse:
    def __init__(self, stats: VideoCommentStats):
        self.video_id = stats.video_id
        self.total_comments = stats.total_comments
        self.total_likes = stats.total_likes
        self.avg_comment_length = stats.avg_comment_length
        self.learning_relevance_score = stats.learning_relevance_score
        self.depth_score = stats.depth_score
        self.engagement_score = stats.engagement_score
        self.overall_quality_score = stats.overall_quality_score
        self.keyword_stats = stats.keyword_stats
        self.analyzed_at = stats.analyzed_at.isoformat() if stats.analyzed_at else None


class VideoWithCommentScoreResponse:
    def __init__(self, video: Video):
        self.id = video.id
        self.title = video.title
        self.thumbnail_url = video.thumbnail_url
        self.duration = video.duration
        self.difficulty_level = video.difficulty_level
        self.topic_tags = video.topic_tags
        self.comment_quality_score = video.comment_quality_score
        self.comment_count = video.comment_count
        self.youtube_video_id = video.youtube_video_id


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def trigger_comment_analysis(
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger async comment analysis for a video. Admin only."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if not video.youtube_video_id:
        raise HTTPException(status_code=400, detail="Video has no YouTube ID")

    from app.tasks.comment_analysis import analyze_video_comments
    analyze_video_comments.delay(video.id, video.youtube_video_id)

    return {
        "message": "Comment analysis started",
        "video_id": video.id,
        "youtube_video_id": video.youtube_video_id,
    }


@router.get("/{video_id}")
async def get_video_comments(
    video_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated comments for a video."""
    # Verify video exists
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Access control: official videos public, user videos require auth
    if not video.is_official and (current_user is None or video.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Video not found")

    # Fetch comments
    offset = (page - 1) * page_size
    result = await db.execute(
        select(VideoComment)
        .where(VideoComment.video_id == video_id)
        .order_by(VideoComment.like_count.desc())
        .offset(offset)
        .limit(page_size)
    )
    comments = result.scalars().all()

    # Total count
    count_result = await db.execute(
        select(VideoComment).where(VideoComment.video_id == video_id)
    )
    total = len(count_result.scalars().all())

    return {
        "items": [CommentResponse(c).__dict__ for c in comments],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": total > page * page_size,
    }


@router.get("/{video_id}/stats")
async def get_comment_stats(
    video_id: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get comment quality statistics for a video."""
    # Verify video exists
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Access control
    if not video.is_official and (current_user is None or video.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Video not found")

    result = await db.execute(
        select(VideoCommentStats).where(VideoCommentStats.video_id == video_id)
    )
    stats = result.scalar_one_or_none()
    if not stats:
        return {
            "video_id": video_id,
            "analyzed": False,
            "message": "Comment analysis not yet performed for this video",
        }

    return {
        "analyzed": True,
        **CommentStatsResponse(stats).__dict__,
    }


@router.get("/top-videos")
async def get_top_videos_by_comment_quality(
    category: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get videos sorted by comment quality score."""
    from app.models.video import VideoStatus

    stmt = (
        select(Video)
        .where(
            Video.is_official == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
            Video.comment_quality_score.isnot(None),
        )
        .order_by(Video.comment_quality_score.desc())
        .limit(limit)
    )

    if category:
        stmt = stmt.where(Video.topic_tags == category)

    result = await db.execute(stmt)
    videos = result.scalars().all()

    return {
        "items": [VideoWithCommentScoreResponse(v).__dict__ for v in videos],
        "total": len(videos),
    }
