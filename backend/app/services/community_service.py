import logging

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community import CommentLike, CommentReport, Follow, Post, PostLike, UserComment
from app.models.user import User

logger = logging.getLogger(__name__)


def _user_brief(user: User) -> dict:
    """Build a UserProfileBrief dict from a User model."""
    return {
        "id": user.id,
        "name": user.name,
        "avatar_url": None,  # avatar_url not yet on User model
        "level": user.level,
    }


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
) -> Post:
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
    await db.commit()
    await db.refresh(post)
    return post


async def get_feed(
    db: AsyncSession,
    user_id: str | None,
    post_type: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Return a mixed feed: posts from followed users + popular posts from all users.

    If the user has no follows yet, fall back to trending (most-liked) posts.
    """
    offset = (page - 1) * page_size

    # Determine followed user IDs
    followed_ids: list[str] = []
    if user_id:
        result = await db.execute(select(Follow.followee_id).where(Follow.follower_id == user_id))
        followed_ids = [row[0] for row in result.all()]

    # Base query filter
    conditions = []
    if post_type:
        conditions.append(Post.post_type == post_type)

    # If user follows others, show their posts first, then fill with popular
    if followed_ids:
        # Priority: followed users' posts
        followed_conditions = [Post.user_id.in_(followed_ids), *conditions]
        stmt_followed = select(Post).where(and_(*followed_conditions)).order_by(Post.created_at.desc())

        # Fill: popular posts from non-followed users
        fill_conditions = [~Post.user_id.in_(followed_ids), *conditions]
        stmt_fill = select(Post).where(and_(*fill_conditions)).order_by(Post.like_count.desc(), Post.created_at.desc())

        # Execute both and merge
        result_followed = await db.execute(stmt_followed)
        followed_posts = list(result_followed.scalars().all())

        result_fill = await db.execute(stmt_fill)
        fill_posts = list(result_fill.scalars().all())

        # Interleave: followed first, then fill
        all_posts = followed_posts + fill_posts
        # Deduplicate by id
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
        stmt = stmt.order_by(Post.like_count.desc(), Post.created_at.desc())
        result = await db.execute(stmt)
        all_posts = list(result.scalars().all())

    # Paginate
    page_posts = all_posts[offset : offset + page_size]
    has_more = len(all_posts) > offset + page_size

    # Load users for posts
    items = []
    for post in page_posts:
        user_result = await db.execute(select(User).where(User.id == post.user_id))
        post_user = user_result.scalar_one_or_none()

        is_liked = False
        if user_id:
            like_result = await db.execute(
                select(PostLike).where(PostLike.user_id == user_id, PostLike.post_id == post.id)
            )
            is_liked = like_result.scalar_one_or_none() is not None

        items.append(
            {
                "id": post.id,
                "user": _user_brief(post_user)
                if post_user
                else {"id": post.user_id, "name": None, "avatar_url": None, "level": None},
                "post_type": post.post_type,
                "content": post.content,
                "media_url": post.media_url,
                "like_count": post.like_count,
                "comment_count": post.comment_count,
                "is_liked": is_liked,
                "created_at": post.created_at,
            }
        )

    return {"items": items, "has_more": has_more}


async def toggle_post_like(db: AsyncSession, user_id: str, post_id: str) -> dict:
    """Toggle like on a post. Returns {"liked": bool}."""
    result = await db.execute(select(PostLike).where(PostLike.user_id == user_id, PostLike.post_id == post_id))
    existing = result.scalar_one_or_none()

    post_result = await db.execute(select(Post).where(Post.id == post_id))
    post = post_result.scalar_one_or_none()
    if post is None:
        raise ValueError("Post not found")

    if existing:
        await db.delete(existing)
        post.like_count = max(0, post.like_count - 1)
        await db.commit()
        return {"liked": False}
    else:
        like = PostLike(user_id=user_id, post_id=post_id)
        db.add(like)
        post.like_count += 1
        await db.commit()
        return {"liked": True}


async def delete_post(db: AsyncSession, user_id: str, post_id: str) -> None:
    """Delete a post. Verifies ownership."""
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if post is None:
        raise ValueError("Post not found")
    if post.user_id != user_id:
        raise PermissionError("Not your post")

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
) -> UserComment:
    """Add a comment to a post. Increments post.comment_count."""
    post_result = await db.execute(select(Post).where(Post.id == post_id))
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
    post.comment_count += 1
    await db.commit()
    await db.refresh(comment)
    return comment


async def delete_comment(db: AsyncSession, user_id: str, comment_id: str) -> None:
    """Delete a comment. Verifies ownership. Decrements post.comment_count."""
    result = await db.execute(select(UserComment).where(UserComment.id == comment_id))
    comment = result.scalar_one_or_none()
    if comment is None:
        raise ValueError("Comment not found")
    if comment.user_id != user_id:
        raise PermissionError("Not your comment")

    # Decrement post comment count
    post_result = await db.execute(select(Post).where(Post.id == comment.post_id))
    post = post_result.scalar_one_or_none()
    if post:
        post.comment_count = max(0, post.comment_count - 1)

    await db.delete(comment)
    await db.commit()


async def toggle_comment_like(db: AsyncSession, user_id: str, comment_id: str) -> dict:
    """Toggle like on a comment. Returns {"liked": bool}."""
    result = await db.execute(
        select(CommentLike).where(CommentLike.user_id == user_id, CommentLike.comment_id == comment_id)
    )
    existing = result.scalar_one_or_none()

    comment_result = await db.execute(select(UserComment).where(UserComment.id == comment_id))
    comment = comment_result.scalar_one_or_none()
    if comment is None:
        raise ValueError("Comment not found")

    if existing:
        await db.delete(existing)
        comment.like_count = max(0, comment.like_count - 1)
        await db.commit()
        return {"liked": False}
    else:
        like = CommentLike(user_id=user_id, comment_id=comment_id)
        db.add(like)
        comment.like_count += 1
        await db.commit()
        return {"liked": True}


async def report_comment(db: AsyncSession, reporter_id: str, comment_id: str, reason: str) -> CommentReport:
    """Report a comment. Prevents duplicate reports by same user."""
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
    await db.commit()
    await db.refresh(report)
    return report


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
            "user": _user_brief(u) if u else {"id": c.user_id, "name": None, "avatar_url": None, "level": None},
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
    """Toggle follow/unfollow. Returns {"following": bool}."""
    if follower_id == followee_id:
        raise ValueError("Cannot follow yourself")

    # Verify followee exists
    followee_result = await db.execute(select(User).where(User.id == followee_id))
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
        await db.commit()
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

    items = []
    for f in follows:
        user_result = await db.execute(select(User).where(User.id == f.follower_id))
        follower_user = user_result.scalar_one_or_none()
        items.append(
            {
                "id": f.id,
                "user": _user_brief(follower_user)
                if follower_user
                else {"id": f.follower_id, "name": None, "avatar_url": None, "level": None},
                "created_at": f.created_at,
            }
        )

    has_more = total > offset + page_size
    return {"items": items, "has_more": has_more, "total": total}


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

    items = []
    for f in follows:
        user_result = await db.execute(select(User).where(User.id == f.followee_id))
        followee_user = user_result.scalar_one_or_none()
        items.append(
            {
                "id": f.id,
                "user": _user_brief(followee_user)
                if followee_user
                else {"id": f.followee_id, "name": None, "avatar_url": None, "level": None},
                "created_at": f.created_at,
            }
        )

    has_more = total > offset + page_size
    return {"items": items, "has_more": has_more, "total": total}
