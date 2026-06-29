import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_optional_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.community import (
    CommentCreate,
    CommentResponse,
    FollowResponse,
    PostCreate,
    PostResponse,
    ReportCreate,
)
from app.services import community_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/community", tags=["community"])


# ---------------------------------------------------------------------------
# Feed
# ---------------------------------------------------------------------------


@router.get("/feed")
@rate_limit("30/minute")
async def get_feed(
    request: Request,
    type: str | None = Query(None, alias="type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get community feed. Authenticated users see posts from followed users + popular.
    Anonymous users see trending posts. ``type`` filters by post type
    (incl. ``video_share`` for UGC videos surfaced to the community)."""
    user_id = current_user.id if current_user else None
    return await community_service.get_feed(db, user_id=user_id, post_type=type, page=page, page_size=page_size)


@router.get("/videos")
@rate_limit("30/minute")
async def list_community_videos(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List published user-uploaded videos for the community feed.

    Per the UGC design, approved UGC surfaces only in the community (the
    homepage/browse feed stays official-curated). Public endpoint.
    """
    from app.services.video_service import list_published_ugc_videos

    return await list_published_ugc_videos(db, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------


@router.post("/posts", status_code=status.HTTP_201_CREATED)
@rate_limit("10/minute")
async def create_post(
    request: Request,
    data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new community post."""
    try:
        post = await community_service.create_post(
            db,
            user_id=current_user.id,
            post_type=data.post_type,
            content=data.content,
            media_url=data.media_url,
            video_id=data.video_id,
            speaking_attempt_id=data.speaking_attempt_id,
            vocabulary_id=data.vocabulary_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    # Resolve the attached video brief for video_share posts.
    video_brief = None
    if post.post_type == "video_share" and post.video_id:
        from app.models.video import Video

        v = (await db.execute(select(Video).where(Video.id == post.video_id))).scalar_one_or_none()
        video_brief = community_service._video_brief(v)

    # Build response with user info
    return {
        "id": post.id,
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "avatar_url": current_user.avatar_url,
            "level": current_user.level,
        },
        "post_type": post.post_type,
        "content": post.content,
        "media_url": post.media_url,
        "like_count": post.like_count,
        "comment_count": post.comment_count,
        "is_liked": False,
        "created_at": post.created_at,
        "video": video_brief,
    }


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
@rate_limit("10/minute")
async def delete_post(
    request: Request,
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete your own post."""
    try:
        await community_service.delete_post(db, user_id=current_user.id, post_id=post_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Post not found") from None
    except PermissionError:
        raise HTTPException(status_code=403, detail="Not your post") from None


@router.post("/posts/{post_id}/like")
@rate_limit("30/minute")
async def toggle_post_like(
    request: Request,
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle like on a post."""
    try:
        return await community_service.toggle_post_like(db, user_id=current_user.id, post_id=post_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Post not found") from None


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


@router.get("/posts/{post_id}/comments", response_model=list[CommentResponse])
@rate_limit("30/minute")
async def get_post_comments(
    request: Request,
    post_id: str,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get comments for a post, structured as a tree."""
    user_id = current_user.id if current_user else None
    return await community_service.get_post_comments(db, post_id=post_id, user_id=user_id)


@router.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
@rate_limit("10/minute")
async def add_comment(
    request: Request,
    post_id: str,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a post."""
    try:
        comment = await community_service.add_comment(
            db,
            user_id=current_user.id,
            post_id=post_id,
            content=data.content,
            parent_id=data.parent_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "id": comment.id,
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "avatar_url": current_user.avatar_url,
            "level": current_user.level,
        },
        "content": comment.content,
        "parent_id": comment.parent_id,
        "like_count": comment.like_count,
        "is_liked": False,
        "replies": [],
        "created_at": comment.created_at,
    }


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
@rate_limit("10/minute")
async def delete_comment(
    request: Request,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete your own comment."""
    try:
        await community_service.delete_comment(db, user_id=current_user.id, comment_id=comment_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Comment not found") from None
    except PermissionError:
        raise HTTPException(status_code=403, detail="Not your comment") from None


@router.post("/comments/{comment_id}/like")
@rate_limit("30/minute")
async def toggle_comment_like(
    request: Request,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle like on a comment."""
    try:
        return await community_service.toggle_comment_like(db, user_id=current_user.id, comment_id=comment_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Comment not found") from None


@router.post("/comments/{comment_id}/report", status_code=status.HTTP_201_CREATED)
@rate_limit("5/minute")
async def report_comment(
    request: Request,
    comment_id: str,
    data: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Report a comment for moderation."""
    try:
        report = await community_service.report_comment(
            db, reporter_id=current_user.id, comment_id=comment_id, reason=data.reason
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "id": report.id,
        "comment_id": report.comment_id,
        "reason": report.reason,
        "created_at": report.created_at,
    }


# ---------------------------------------------------------------------------
# Follows
# ---------------------------------------------------------------------------


@router.post("/follow/{user_id}")
@rate_limit("20/minute")
async def toggle_follow(
    request: Request,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Follow or unfollow a user."""
    try:
        return await community_service.toggle_follow(db, follower_id=current_user.id, followee_id=user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/followers")
@rate_limit("30/minute")
async def get_followers(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List users who follow you."""
    return await community_service.get_followers(db, user_id=current_user.id, page=page, page_size=page_size)


@router.get("/following")
@rate_limit("30/minute")
async def get_following(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List users you follow."""
    return await community_service.get_following(db, user_id=current_user.id, page=page, page_size=page_size)
