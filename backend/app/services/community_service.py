import logging

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.community import CommentLike, CommentReport, Follow, Post, PostLike, UserComment, VideoLike
from app.models.user import User
from app.models.video import Video
from app.schemas.community import UserProfileBrief, VideoBrief
from app.schemas.pagination import paginated
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)

# Videos whose like_count OR favorite_count >= this threshold are auto-featured.
FEATURE_THRESHOLD = 10


async def _user_name(db: AsyncSession, user_id: str) -> str | None:
    """Fetch a user's display name, or None if the user does not exist."""
    result = await db.execute(select(User.name).where(User.id == user_id))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------


async def create_post(
    db: AsyncSession,
    user_id: str,
    post_type: str,
    content: str,
    media_url: str | None = None,
    video_id: str | None = None,
    speaking_attempt_id: str | None = None,
    vocabulary_id: str | None = None,
) -> dict:
    """Create a community post and return the full response dict.

    Validates video share rules, persists the post, and resolves the
    attached video brief — so the route handler only does HTTP concerns.
    """
    # A video_share post must reference a video the poster is allowed to surface:
    # their own published video, or an official published video. This stops a
    # user from attaching another user's private/unpublished video to a public post.
    if video_id is not None:
        from app.models.video import VideoReviewStatus, VideoStatus

        v_result = await db.execute(select(Video).where(Video.id == video_id))
        video = v_result.scalar_one_or_none()
        if video is None:
            raise ValueError("Video not found")
        if video.status not in (VideoStatus.ready, VideoStatus.ready_subtitles):
            raise ValueError("视频仍在处理中，暂不可分享")
        shareable = video.is_official or video.user_id == user_id
        if not shareable:
            raise ValueError("无权分享该视频")
        if not video.is_official and video.review_status != VideoReviewStatus.published.value:
            raise ValueError("视频尚未通过审核，暂不可分享")
    elif post_type == "video_share":
        raise ValueError("video_share 帖子必须包含 video_id")

    post = Post(
        user_id=user_id,
        post_type=post_type,
        content=content,
        media_url=media_url,
        video_id=video_id,
        speaking_attempt_id=speaking_attempt_id,
        vocabulary_id=vocabulary_id,
    )
    db.add(post)
    await commit_refresh(db, post)

    # Resolve the attached video brief for video_share posts.
    video_brief = None
    if post.post_type == "video_share" and post.video_id:
        v_result = await db.execute(select(Video).where(Video.id == post.video_id))
        v = v_result.scalar_one_or_none()
        video_brief = VideoBrief.from_model(v)

    # Resolve the author's UserProfileBrief.
    author_result = await db.execute(select(User).where(User.id == user_id))
    author = author_result.scalar_one_or_none()

    return {
        "id": post.id,
        "user": UserProfileBrief.from_model(author)
        if author
        else {"id": user_id, "name": None, "avatar_url": None, "level": None},
        "post_type": post.post_type,
        "content": post.content,
        "media_url": post.media_url,
        "like_count": post.like_count,
        "comment_count": post.comment_count,
        "is_liked": False,
        "created_at": post.created_at,
        "video": video_brief,
    }


async def _attach_videos(db: AsyncSession, posts: list[Post]) -> dict[str, dict]:
    """Batch-load VideoBriefs for every video_share post in ``posts``.

    Only returns videos that are publicly accessible (official or published UGC).
    Videos in processing/error state or unpublished UGC are filtered out.
    """
    video_ids = {p.video_id for p in posts if p.post_type == "video_share" and p.video_id}
    if not video_ids:
        return {}
    from app.models.video import VideoReviewStatus, VideoStatus

    result = await db.execute(
        select(Video).where(
            Video.id.in_(video_ids),
            Video.status == VideoStatus.ready,
            or_(
                Video.is_official == True,
                Video.review_status == VideoReviewStatus.published.value,
                and_(
                    Video.review_status.in_((VideoReviewStatus.pending_review.value, VideoReviewStatus.rejected.value)),
                    Video.published_snapshot.isnot(None),
                ),
            ),
        )
    )
    return {v.id: VideoBrief.from_model(v) for v in result.scalars().all()}


async def get_feed(
    db: AsyncSession,
    user_id: str | None,
    post_type: str | None = None,
    sort: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Return a mixed feed: posts from followed users + popular posts from all users.

    If the user has no follows yet, fall back to trending (most-liked) posts.
    ``sort="trending"`` forces global trending order regardless of follows.
    """
    offset = (page - 1) * page_size
    # Fetch one extra row to detect has_more without an extra COUNT query.
    fetch_size = page_size + 1

    conditions = []
    if post_type:
        conditions.append(Post.post_type == post_type)

    # Trending: always sort by like_count globally
    if sort == "trending":
        stmt = select(Post)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(Post.like_count.desc(), Post.created_at.desc()).offset(offset).limit(fetch_size)
        result = await db.execute(stmt)
        all_posts = list(result.scalars().all())
    elif followed_ids := (
        [row[0] for row in (await db.execute(select(Follow.followee_id).where(Follow.follower_id == user_id))).all()]
        if user_id
        else []
    ):
        # Priority: followed users' posts
        followed_conditions = [Post.user_id.in_(followed_ids), *conditions]
        stmt_followed = (
            select(Post).where(and_(*followed_conditions)).order_by(Post.created_at.desc()).limit(fetch_size)
        )

        # Fill: popular posts from non-followed users
        fill_conditions = [~Post.user_id.in_(followed_ids), *conditions]
        stmt_fill = (
            select(Post)
            .where(and_(*fill_conditions))
            .order_by(Post.like_count.desc(), Post.created_at.desc())
            .limit(fetch_size)
        )

        # Execute both and merge
        result_followed = await db.execute(stmt_followed)
        followed_posts = list(result_followed.scalars().all())

        result_fill = await db.execute(stmt_fill)
        fill_posts = list(result_fill.scalars().all())

        # Interleave: followed first, then fill; deduplicate by id.
        all_posts = followed_posts + fill_posts
        seen = set()
        unique_posts = []
        for p in all_posts:
            if p.id not in seen:
                seen.add(p.id)
                unique_posts.append(p)
        all_posts = unique_posts
    else:
        # No follows: show trending (most liked)
        stmt = select(Post)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(Post.like_count.desc(), Post.created_at.desc()).offset(offset).limit(fetch_size)
        result = await db.execute(stmt)
        all_posts = list(result.scalars().all())

    # Detect has_more: we fetched fetch_size = page_size+1 rows.
    has_more = len(all_posts) > page_size
    page_posts = all_posts[:page_size]

    # Batch-load authors + attached videos for the page.
    videos_by_id = await _attach_videos(db, page_posts)

    # Batch-load users for all page posts (1 query instead of N)
    user_ids = list({p.user_id for p in page_posts if p.user_id})
    users_by_id: dict[str, User] = {}
    if user_ids:
        user_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_by_id = {u.id: u for u in user_result.scalars().all()}

    # Batch-load like status for current user (1 query instead of N)
    liked_post_ids: set[str] = set()
    if user_id and page_posts:
        post_ids = [p.id for p in page_posts]
        like_result = await db.execute(
            select(PostLike.post_id).where(PostLike.user_id == user_id, PostLike.post_id.in_(post_ids))
        )
        liked_post_ids = {row[0] for row in like_result.all()}

    items = []
    for post in page_posts:
        post_user = users_by_id.get(post.user_id)

        items.append(
            {
                "id": post.id,
                "user": UserProfileBrief.from_model(post_user)
                if post_user
                else {"id": post.user_id, "name": None, "avatar_url": None, "level": None},
                "post_type": post.post_type,
                "content": post.content,
                "media_url": post.media_url,
                "like_count": post.like_count,
                "comment_count": post.comment_count,
                "is_liked": post.id in liked_post_ids,
                "created_at": post.created_at,
                "video": videos_by_id.get(post.video_id) if post.post_type == "video_share" else None,
            }
        )

    return paginated(items, page=page, page_size=page_size, has_more=has_more)


async def toggle_post_like(db: AsyncSession, user_id: str, post_id: str) -> dict:
    """Toggle like on a post. Returns {"liked": bool}.

    Uses row-level locking + atomic SQL increment/decrement to prevent
    race conditions when multiple users like the same post concurrently.
    Lock the Post row FIRST, then check for existing like — this serializes
    double-clicks from the same user so the second sees the first's row.
    """
    # Lock the post row to serialize concurrent counter updates.
    post_result = await db.execute(select(Post).where(Post.id == post_id).with_for_update())
    post = post_result.scalar_one_or_none()
    if post is None:
        raise ValueError("Post not found")

    result = await db.execute(select(PostLike).where(PostLike.user_id == user_id, PostLike.post_id == post_id))
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        post.like_count = max(0, post.like_count - 1)
        await db.commit()
        return {"liked": False}
    else:
        like = PostLike(user_id=user_id, post_id=post_id)
        db.add(like)
        post.like_count = (post.like_count or 0) + 1
        # Notify the post owner (never self) of the new like.
        if post.user_id != user_id:
            actor_name = await _user_name(db, user_id)
            await create_notification(
                user_id=post.user_id,
                type="post_liked",
                title="收到点赞",
                message=f"{actor_name or '有人'} 赞了你的帖子",
                db=db,
                related_url=f"/community?post={post_id}",
            )
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            if "uq_post_like" in str(exc):
                # Duplicate like from a race — treat as already liked
                return {"liked": True}
            raise
        return {"liked": True}


async def delete_post(db: AsyncSession, user_id: str, post_id: str) -> None:
    """Delete a post. Verifies ownership.

    Cascades: deletes all comments, comment likes, and comment reports
    before the post to avoid FK constraint errors (UserComment.post_id
    has no ondelete cascade).
    """
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if post is None:
        raise ValueError("Post not found")
    if post.user_id != user_id:
        raise PermissionError("Not your post")

    # Delete comment reports and likes first (they reference comments)
    comment_ids_stmt = select(UserComment.id).where(UserComment.post_id == post_id)
    from app.models.community import CommentLike, CommentReport, PostLike

    await db.execute(CommentReport.__table__.delete().where(CommentReport.comment_id.in_(comment_ids_stmt)))
    await db.execute(CommentLike.__table__.delete().where(CommentLike.comment_id.in_(comment_ids_stmt)))
    # Delete all comments on the post
    await db.execute(UserComment.__table__.delete().where(UserComment.post_id == post_id))
    # Delete post likes
    await db.execute(PostLike.__table__.delete().where(PostLike.post_id == post_id))
    # Finally delete the post itself
    await db.delete(post)
    await db.commit()


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


async def add_comment(
    db: AsyncSession,
    user_id: str,
    post_id: str,
    content: str,
    parent_id: str | None = None,
) -> dict:
    """Add a comment to a post. Increments post.comment_count atomically.

    Returns the full response dict so the route handler only does HTTP concerns.
    """
    post_result = await db.execute(select(Post).where(Post.id == post_id).with_for_update())
    post = post_result.scalar_one_or_none()
    if post is None:
        raise ValueError("Post not found")

    # Validate parent comment belongs to same post
    if parent_id:
        parent_result = await db.execute(select(UserComment).where(UserComment.id == parent_id))
        parent = parent_result.scalar_one_or_none()
        if parent is None:
            raise ValueError("Parent comment not found")
        if parent.post_id != post_id:
            raise ValueError("Parent comment does not belong to this post")

    comment = UserComment(user_id=user_id, post_id=post_id, content=content, parent_id=parent_id)
    db.add(comment)
    post.comment_count = (post.comment_count or 0) + 1

    # Notify relevant users (never self) of the new comment.
    actor_name = await _user_name(db, user_id)
    notified: set[str] = set()
    if parent_id and parent is not None and parent.user_id != user_id:
        await create_notification(
            user_id=parent.user_id,
            type="comment_reply",
            title="收到回复",
            message=f"{actor_name or '有人'} 回复了你的评论",
            db=db,
            related_url=f"/community?post={post_id}",
        )
        notified.add(parent.user_id)
    # Top-level comment (or a reply whose parent author is the post owner) → notify post owner.
    if post.user_id != user_id and post.user_id not in notified:
        await create_notification(
            user_id=post.user_id,
            type="comment_reply",
            title="收到评论",
            message=f"{actor_name or '有人'} 评论了你的帖子",
            db=db,
            related_url=f"/community?post={post_id}",
        )

    await commit_refresh(db, comment)

    # Resolve the author's UserProfileBrief.
    author_result = await db.execute(select(User).where(User.id == user_id))
    author = author_result.scalar_one_or_none()

    return {
        "id": comment.id,
        "user": UserProfileBrief.from_model(author)
        if author
        else {"id": user_id, "name": None, "avatar_url": None, "level": None},
        "content": comment.content,
        "parent_id": comment.parent_id,
        "like_count": comment.like_count,
        "is_liked": False,
        "replies": [],
        "created_at": comment.created_at,
    }


async def delete_comment(db: AsyncSession, user_id: str, comment_id: str) -> None:
    """Delete a comment. Verifies ownership. Decrements post.comment_count atomically.

    Cascades: deletes comment likes and reports before the comment to
    avoid FK constraint errors.
    """
    result = await db.execute(select(UserComment).where(UserComment.id == comment_id))
    comment = result.scalar_one_or_none()
    if comment is None:
        raise ValueError("Comment not found")
    if comment.user_id != user_id:
        raise PermissionError("Not your comment")

    # Decrement post comment count atomically
    post_result = await db.execute(select(Post).where(Post.id == comment.post_id).with_for_update())
    post = post_result.scalar_one_or_none()
    if post:
        post.comment_count = max(0, post.comment_count - 1)

    # Delete child rows first to avoid FK constraint errors
    from app.models.community import CommentLike, CommentReport

    await db.execute(CommentLike.__table__.delete().where(CommentLike.comment_id == comment_id))
    await db.execute(CommentReport.__table__.delete().where(CommentReport.comment_id == comment_id))

    await db.delete(comment)
    await db.commit()


async def toggle_comment_like(db: AsyncSession, user_id: str, comment_id: str) -> dict:
    """Toggle like on a comment. Returns {"liked": bool}.

    Uses row-level locking + atomic SQL increment/decrement to prevent
    race conditions when multiple users like the same comment concurrently.
    Lock the comment row FIRST, then check for existing like.
    """
    comment_result = await db.execute(select(UserComment).where(UserComment.id == comment_id).with_for_update())
    comment = comment_result.scalar_one_or_none()
    if comment is None:
        raise ValueError("Comment not found")

    result = await db.execute(
        select(CommentLike).where(CommentLike.user_id == user_id, CommentLike.comment_id == comment_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        comment.like_count = max(0, comment.like_count - 1)
        await db.commit()
        return {"liked": False}
    else:
        like = CommentLike(user_id=user_id, comment_id=comment_id)
        db.add(like)
        comment.like_count = (comment.like_count or 0) + 1
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            if "uq_comment_like" in str(exc):
                return {"liked": True}
            raise
        return {"liked": True}


async def report_comment(db: AsyncSession, reporter_id: str, comment_id: str, reason: str) -> dict:
    """Report a comment. Prevents duplicate reports by same user.

    The ``uq_comment_report_comment_reporter`` unique constraint is the
    final safety net — if two concurrent requests both pass the SELECT
    check, the duplicate INSERT raises IntegrityError which we convert
    to a clean "already reported" error instead of a 500.

    Returns the full response dict so the route handler only does HTTP concerns.
    """
    # Check for existing report
    existing = await db.execute(
        select(CommentReport).where(
            CommentReport.reporter_id == reporter_id,
            CommentReport.comment_id == comment_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Already reported this comment")

    # Verify comment exists
    comment_result = await db.execute(select(UserComment).where(UserComment.id == comment_id))
    if comment_result.scalar_one_or_none() is None:
        raise ValueError("Comment not found")

    report = CommentReport(reporter_id=reporter_id, comment_id=comment_id, reason=reason)
    db.add(report)
    try:
        await commit_refresh(db, report)
    except IntegrityError as exc:
        if "uq_comment_report" in str(exc):
            raise ValueError("Already reported this comment") from exc
        raise
    return {
        "id": report.id,
        "comment_id": report.comment_id,
        "reason": report.reason,
        "created_at": report.created_at,
    }


async def get_post_comments(
    db: AsyncSession,
    post_id: str,
    user_id: str | None,
) -> list[dict]:
    """Get comments for a post, structured as a tree with replies."""
    result = await db.execute(
        select(UserComment).where(UserComment.post_id == post_id).order_by(UserComment.created_at.asc())
    )
    comments = result.scalars().all()

    # Collect user IDs to batch-load users
    user_ids = {c.user_id for c in comments}
    users_map: dict[str, User] = {}
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in users_result.scalars().all():
            users_map[u.id] = u

    # Collect liked comment IDs for current user
    liked_ids: set[str] = set()
    if user_id:
        comment_ids = [c.id for c in comments]
        if comment_ids:
            likes_result = await db.execute(
                select(CommentLike.comment_id).where(
                    CommentLike.user_id == user_id,
                    CommentLike.comment_id.in_(comment_ids),
                )
            )
            liked_ids = {row[0] for row in likes_result.all()}

    # Build dict representation
    def _comment_dict(c: UserComment) -> dict:
        u = users_map.get(c.user_id)
        return {
            "id": c.id,
            "user": UserProfileBrief.from_model(u) if u else UserProfileBrief(id=c.user_id, name=None).model_dump(),
            "content": c.content,
            "parent_id": c.parent_id,
            "like_count": c.like_count,
            "is_liked": c.id in liked_ids,
            "replies": [],
            "created_at": c.created_at,
        }

    comment_dicts = {c.id: _comment_dict(c) for c in comments}

    # Nest replies under parents
    roots = []
    for c in comments:
        cd = comment_dicts[c.id]
        if c.parent_id and c.parent_id in comment_dicts:
            comment_dicts[c.parent_id]["replies"].append(cd)
        else:
            roots.append(cd)

    return roots


# ---------------------------------------------------------------------------
# Follows
# ---------------------------------------------------------------------------


async def toggle_follow(db: AsyncSession, follower_id: str, followee_id: str) -> dict:
    """Toggle follow/unfollow. Returns {"following": bool}.

    Locks the followee User row to serialize concurrent follow toggles from
    the same follower, preventing duplicate Follow rows.
    """
    if follower_id == followee_id:
        raise ValueError("Cannot follow yourself")

    # Lock the followee row to serialize concurrent toggles
    followee_result = await db.execute(select(User).where(User.id == followee_id).with_for_update())
    if followee_result.scalar_one_or_none() is None:
        raise ValueError("User not found")

    result = await db.execute(
        select(Follow).where(Follow.follower_id == follower_id, Follow.followee_id == followee_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"following": False}
    else:
        follow = Follow(follower_id=follower_id, followee_id=followee_id)
        db.add(follow)
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            if "uq_follow" in str(exc):
                return {"following": True}
            raise
        # Notify the followee only after the Follow row is committed.
        try:
            actor_name = await _user_name(db, follower_id)
            await create_notification(
                user_id=followee_id,
                type="social_follow",
                title="新的关注",
                message=f"{actor_name or '有人'} 关注了你",
                db=db,
                related_url="/community",
            )
            await db.commit()
        except Exception:
            logger.warning("Failed to send follow notification", exc_info=True)
        return {"following": True}


async def get_followers(db: AsyncSession, user_id: str, page: int = 1, page_size: int = 20) -> dict:
    """List users who follow the given user."""
    offset = (page - 1) * page_size

    count_result = await db.execute(select(func.count(Follow.id)).where(Follow.followee_id == user_id))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(Follow)
        .where(Follow.followee_id == user_id)
        .order_by(Follow.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    follows = result.scalars().all()

    # Batch-load follower users (1 query instead of N)
    follower_ids = list({f.follower_id for f in follows})
    users_by_id: dict[str, User] = {}
    if follower_ids:
        user_result = await db.execute(select(User).where(User.id.in_(follower_ids)))
        users_by_id = {u.id: u for u in user_result.scalars().all()}

    items = []
    for f in follows:
        follower_user = users_by_id.get(f.follower_id)
        items.append(
            {
                "id": f.id,
                "user": UserProfileBrief.from_model(follower_user)
                if follower_user
                else {"id": f.follower_id, "name": None, "avatar_url": None, "level": None},
                "created_at": f.created_at,
            }
        )

    has_more = total > offset + page_size
    return paginated(items, page=page, page_size=page_size, has_more=has_more, total=total)


async def get_following(db: AsyncSession, user_id: str, page: int = 1, page_size: int = 20) -> dict:
    """List users the given user follows."""
    offset = (page - 1) * page_size

    count_result = await db.execute(select(func.count(Follow.id)).where(Follow.follower_id == user_id))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(Follow)
        .where(Follow.follower_id == user_id)
        .order_by(Follow.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    follows = result.scalars().all()

    # Batch-load followee users (1 query instead of N)
    followee_ids = list({f.followee_id for f in follows})
    users_by_id: dict[str, User] = {}
    if followee_ids:
        user_result = await db.execute(select(User).where(User.id.in_(followee_ids)))
        users_by_id = {u.id: u for u in user_result.scalars().all()}

    items = []
    for f in follows:
        followee_user = users_by_id.get(f.followee_id)
        items.append(
            {
                "id": f.id,
                "user": UserProfileBrief.from_model(followee_user)
                if followee_user
                else {"id": f.followee_id, "name": None, "avatar_url": None, "level": None},
                "created_at": f.created_at,
            }
        )

    has_more = total > offset + page_size
    return paginated(items, page=page, page_size=page_size, has_more=has_more, total=total)


# ---------------------------------------------------------------------------
# Video likes
# ---------------------------------------------------------------------------


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
