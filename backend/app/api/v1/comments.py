from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user, get_optional_user, require_video_access
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.comment import VideoComment, VideoCommentStats
from app.models.user import User
from app.models.video import Video
from app.schemas.comment import CommentResponse, CommentStatsResponse, VideoWithCommentScoreResponse

router = APIRouter(prefix="/comments", tags=["comments"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

# IMPORTANT: static paths must be registered before /{video_id} so FastAPI does
# not match "top-videos" / "analyze" against the dynamic video_id parameter.


@router.get("/top-videos")
@rate_limit("30/minute")
async def get_top_videos_by_comment_quality(
    request: Request,
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get videos sorted by comment quality score (paginated)."""
    from app.models.video import VideoStatus

    offset = (page - 1) * page_size
    stmt = (
        select(Video)
        .where(
            Video.is_official == True,
            Video.is_published == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
            Video.comment_quality_score.isnot(None),
        )
        .order_by(Video.comment_quality_score.desc())
        .offset(offset)
        .limit(page_size)
    )

    if category:
        stmt = stmt.where(Video.topic_tags == category)

    result = await db.execute(stmt)
    videos = result.scalars().all()

    # Count total for has_more
    count_stmt = select(func.count(Video.id)).where(
        Video.is_official == True,
        Video.is_published == True,
        Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        Video.comment_quality_score.isnot(None),
    )
    if category:
        count_stmt = count_stmt.where(Video.topic_tags == category)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    return {
        "items": [VideoWithCommentScoreResponse.model_validate(v).model_dump() for v in videos],
        "page": page,
        "page_size": page_size,
        "has_more": total > page * page_size,
    }


@router.post("/analyze")
@rate_limit("5/minute")
async def trigger_comment_analysis(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger async comment analysis for a video. Admin only."""
    video = await require_video_access(video_id, current_user, db)

    from app.tasks.comment_analysis import analyze_video_comments

    analyze_video_comments.delay(video.id)

    return {
        "message": "Comment analysis started",
        "video_id": video.id,
    }


@router.get("/{video_id}")
@rate_limit("30/minute")
async def get_video_comments(
    request: Request,
    video_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated comments for a video."""
    await require_video_access(video_id, current_user, db)

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

    # Total count via COUNT(*) — avoids loading all records into memory
    count_result = await db.execute(
        select(func.count()).select_from(VideoComment).where(VideoComment.video_id == video_id)
    )
    total = count_result.scalar_one()

    return {
        "items": [CommentResponse.model_validate(c).model_dump() for c in comments],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": total > page * page_size,
    }


@router.get("/{video_id}/stats")
@rate_limit("30/minute")
async def get_comment_stats(
    request: Request,
    video_id: str,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get comment quality statistics for a video."""
    await require_video_access(video_id, current_user, db)

    result = await db.execute(select(VideoCommentStats).where(VideoCommentStats.video_id == video_id))
    stats = result.scalar_one_or_none()
    if not stats:
        return {
            "video_id": video_id,
            "analyzed": False,
            "message": "Comment analysis not yet performed for this video",
        }

    return {
        "analyzed": True,
        **CommentStatsResponse.model_validate(stats).model_dump(),
    }
