"""Admin service — business logic for the admin panel endpoints.

All functions receive an ``AsyncSession`` and return plain dicts or model
instances that the route handler serialises via Pydantic schemas.
"""

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import _to_aware_utc
from app.core.database import commit_refresh
from app.models.community import CommentReport, Post, UserComment
from app.models.learning import LearningRecord, Vocabulary
from app.models.order import Order
from app.models.user import PlanType, RoleType, User
from app.models.video import Video, VideoStatus
from app.schemas.pagination import has_more, paginated

logger = logging.getLogger(__name__)


def _dt_iso(v: object) -> str | None:
    """Serialize datetime to ISO string, or return None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


# ---------------------------------------------------------------------------
# Stats dashboard
# ---------------------------------------------------------------------------


async def get_admin_stats(db: AsyncSession, days: int = 30) -> dict:
    """Aggregate dashboard KPIs, trend data, distributions, and recent activity."""

    now = datetime.now(UTC)
    ago_7d = now - timedelta(days=7)
    ago_nd = now - timedelta(days=days)
    today = now.date()

    # --- KPI counts ---
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    new_users_7d = (await db.execute(select(func.count(User.id)).where(User.created_at >= ago_7d))).scalar_one()
    pro_users = (await db.execute(select(func.count(User.id)).where(User.plan == PlanType.pro))).scalar_one()
    total_videos = (await db.execute(select(func.count(Video.id)))).scalar_one()
    videos_ready = (
        await db.execute(select(func.count(Video.id)).where(Video.status == VideoStatus.ready))
    ).scalar_one()
    # Vocabulary KPI — replaces the frozen speaking_attempts count (ADR-0003):
    # speaking progress tracking is gone; vocabulary is the active learning metric.
    total_vocabulary = (await db.execute(select(func.count(Vocabulary.id)))).scalar_one()
    total_posts = (await db.execute(select(func.count(Post.id)))).scalar_one()
    pending_reports = (
        await db.execute(select(func.count(CommentReport.id)).where(CommentReport.status == "pending"))
    ).scalar_one()

    # Active users: users whose last_active_at falls in the window
    active_users_today = (
        await db.execute(select(func.count(User.id)).where(func.date(User.last_active_at) == today))
    ).scalar_one()
    active_users_7d = (await db.execute(select(func.count(User.id)).where(User.last_active_at >= ago_7d))).scalar_one()

    # --- Trend data ---
    # Signup trend: count users created per day
    signup_rows = (
        await db.execute(
            select(func.date(User.created_at).label("d"), func.count(User.id).label("c"))
            .where(User.created_at >= ago_nd)
            .group_by(func.date(User.created_at))
            .order_by(func.date(User.created_at))
        )
    ).all()
    signup_map = {r.d: r.c for r in signup_rows}

    # Vocabulary trend: new words added per day (SM-2 vocabulary table). Replaces
    # the frozen speaking_attempts trend (ADR-0003) — vocabulary is the active
    # learning metric now that AI speaking scoring is removed.
    vocab_rows = (
        await db.execute(
            select(func.date(Vocabulary.created_at).label("d"), func.count(Vocabulary.id).label("c"))
            .where(Vocabulary.created_at >= ago_nd)
            .group_by(func.date(Vocabulary.created_at))
            .order_by(func.date(Vocabulary.created_at))
        )
    ).all()
    vocab_map = {r.d: r.c or 0 for r in vocab_rows}

    # Active users trend: distinct users whose LearningRecord was last accessed
    # per day (real watch activity — DailyActivity snapshots are gone with the
    # activity service per ADR-0002/0003).
    active_rows = (
        await db.execute(
            select(
                func.date(LearningRecord.last_accessed_at).label("d"),
                func.count(func.distinct(LearningRecord.user_id)).label("c"),
            )
            .where(LearningRecord.last_accessed_at >= ago_nd)
            .group_by(func.date(LearningRecord.last_accessed_at))
            .order_by(func.date(LearningRecord.last_accessed_at))
        )
    ).all()
    active_map = {r.d: r.c for r in active_rows}

    dates_list: list[str] = []
    signups_list: list[int] = []
    vocab_list: list[int] = []
    active_list: list[int] = []
    for i in range(days - 1, -1, -1):
        d = (now - timedelta(days=i)).date()
        dates_list.append(d.isoformat())
        signups_list.append(signup_map.get(d, 0))
        vocab_list.append(vocab_map.get(d, 0))
        active_list.append(active_map.get(d, 0))

    # --- Distributions ---
    videos_by_status_rows = (await db.execute(select(Video.status, func.count(Video.id)).group_by(Video.status))).all()
    videos_by_status = [{"status": r[0], "count": r[1]} for r in videos_by_status_rows]

    users_by_plan_rows = (await db.execute(select(User.plan, func.count(User.id)).group_by(User.plan))).all()
    users_by_plan = [{"plan": r[0], "count": r[1]} for r in users_by_plan_rows]

    # --- Recent activity (merge-sort from 5 event sources) ---
    recent: list[dict] = []

    # Signups
    for u in (await db.execute(select(User).order_by(User.created_at.desc()).limit(8))).scalars().all():
        recent.append(
            {
                "id": f"signup-{u.id}",
                "type": "signup",
                "summary": f"新用户 {u.name or u.phone} 注册",
                "created_at": _dt_iso(u.created_at),
            }
        )

    # (Speaking-attempts activity source removed per ADR-0003 — AI speaking
    # scoring is gone, so "完成口语评测" entries would only ever describe a
    # dead feature. The frozen SpeakingAttempt table is no longer surfaced.)

    # Posts
    for p in (
        await db.execute(
            select(Post, User.name, User.phone)
            .join(User, Post.user_id == User.id)
            .order_by(Post.created_at.desc())
            .limit(8)
        )
    ).all():
        post, name, phone = p
        post_type_labels = {
            "text": "帖子",
            "progress_share": "学习打卡",
            "vocabulary_share": "词汇分享",
            "speaking_share": "口语分享",
        }
        recent.append(
            {
                "id": f"post-{post.id}",
                "type": "post",
                "summary": f"{name or phone} 发布了{post_type_labels.get(post.post_type, '帖子')}",
                "created_at": _dt_iso(post.created_at),
            }
        )

    # Reports
    for r in (
        await db.execute(
            select(CommentReport, User.name, User.phone)
            .join(User, CommentReport.reporter_id == User.id)
            .order_by(CommentReport.created_at.desc())
            .limit(8)
        )
    ).all():
        report, name, phone = r
        recent.append(
            {
                "id": f"report-{report.id}",
                "type": "report",
                "summary": f"{name or phone} 举报了一条评论",
                "created_at": _dt_iso(report.created_at),
            }
        )

    # Orders (paid)
    for o in (
        await db.execute(
            select(Order, User.name, User.phone)
            .join(User, Order.user_id == User.id)
            .where(Order.status == "paid")
            .order_by(Order.created_at.desc())
            .limit(8)
        )
    ).all():
        order, name, phone = o
        recent.append(
            {
                "id": f"payment-{order.id}",
                "type": "payment",
                "summary": f"{name or phone} 升级 Pro (¥{order.amount / 100:.0f})",
                "created_at": _dt_iso(order.created_at),
            }
        )

    # Sort all by created_at desc and take top 8
    recent.sort(key=lambda x: x["created_at"] or "", reverse=True)
    recent = recent[:8]

    return {
        "total_users": total_users,
        "new_users_7d": new_users_7d,
        "pro_users": pro_users,
        "total_videos": total_videos,
        "videos_ready": videos_ready,
        "total_vocabulary": total_vocabulary,
        "total_posts": total_posts,
        "pending_reports": pending_reports,
        "active_users_today": active_users_today,
        "active_users_7d": active_users_7d,
        "trend": {
            "dates": dates_list,
            "signups": signups_list,
            "vocabulary": vocab_list,
            "active_users": active_list,
        },
        "videos_by_status": videos_by_status,
        "users_by_plan": users_by_plan,
        "recent_activity": recent,
    }


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------


async def list_admin_users(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    role: str | None = None,
    plan: str | None = None,
    keyword: str | None = None,
) -> dict:
    """List users with aggregated stats, filtered by role/plan/keyword."""

    # Subqueries for aggregated counts.
    # Note: speaking_attempts is intentionally omitted — AI speaking scoring was
    # removed (ADR-0002/0003) and the SpeakingAttempt table is frozen, so a
    # per-user speaking count is dead data.
    vw_count = (
        select(func.count(LearningRecord.id)).where(LearningRecord.user_id == User.id).correlate(User).scalar_subquery()
    )
    posts_count = select(func.count(Post.id)).where(Post.user_id == User.id).correlate(User).scalar_subquery()

    stmt = select(
        User,
        vw_count.label("videos_watched"),
        posts_count.label("posts_count"),
    )

    # Filters
    if role:
        try:
            role_enum = RoleType(role)
        except ValueError:
            role_enum = None
        if role_enum:
            stmt = stmt.where(User.role == role_enum)
    if plan:
        try:
            plan_enum = PlanType(plan)
        except ValueError:
            plan_enum = None
        if plan_enum:
            stmt = stmt.where(User.plan == plan_enum)
    if keyword and keyword.strip():
        k = keyword.strip().lower()
        stmt = stmt.where((func.lower(User.name).contains(k)) | (User.phone.contains(k)))

    # Count total for has_more
    count_stmt = select(func.count(User.id))
    if role:
        try:
            count_stmt = count_stmt.where(User.role == RoleType(role))
        except ValueError:
            pass
    if plan:
        try:
            count_stmt = count_stmt.where(User.plan == PlanType(plan))
        except ValueError:
            pass
    if keyword and keyword.strip():
        k = keyword.strip().lower()
        count_stmt = count_stmt.where((func.lower(User.name).contains(k)) | (User.phone.contains(k)))
    total = (await db.execute(count_stmt)).scalar_one()

    # Paginate
    stmt = stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()

    items = []
    for row in rows:
        user: User = row[0]
        items.append(
            {
                "id": user.id,
                "phone": user.phone,
                "name": user.name,
                "bio": user.bio,
                "avatar_url": user.avatar_url,
                "level": user.level,
                "plan": user.plan.value if user.plan else "free",
                "plan_expires_at": _dt_iso(user.plan_expires_at),
                "timezone": user.timezone,
                "role": user.role.value if user.role else "user",
                "is_banned": user.is_banned,
                "created_at": _dt_iso(user.created_at),
                "last_active_at": _dt_iso(user.last_active_at),
                "videos_watched": int(row[1] or 0),
                "posts_count": row[2] or 0,
            }
        )

    return paginated(items, page=page, page_size=page_size, has_more=has_more(total, page, page_size))


async def _get_user_or_raise(db: AsyncSession, user_id: str) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")
    return user


async def ban_user(db: AsyncSession, user_id: str, is_banned: bool, admin_user_id: str) -> User:
    if user_id == admin_user_id:
        raise ValueError("Cannot ban yourself")
    user = await _get_user_or_raise(db, user_id)
    user.is_banned = is_banned
    await commit_refresh(db, user)
    return user


async def change_user_role(db: AsyncSession, user_id: str, role: str, admin_user_id: str) -> User:
    if user_id == admin_user_id:
        raise ValueError("Cannot change your own role")
    user = await _get_user_or_raise(db, user_id)
    user.role = RoleType(role)
    await commit_refresh(db, user)
    return user


async def change_user_plan(db: AsyncSession, user_id: str, plan: str, duration_days: int) -> User:
    # Lock the User row to prevent race with concurrent payment callback
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")
    user.plan = PlanType(plan)
    if plan == "pro":
        now = datetime.now(UTC)
        current_expires = _to_aware_utc(user.plan_expires_at) if user.plan_expires_at else now
        base = max(current_expires, now)
        user.plan_expires_at = base + timedelta(days=duration_days)
    else:
        user.plan_expires_at = None
    await commit_refresh(db, user)
    return user


# ---------------------------------------------------------------------------
# Community moderation
# ---------------------------------------------------------------------------


async def list_admin_reports(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
) -> dict:
    """List comment reports with joined comment content and reporter info."""

    stmt = (
        select(
            CommentReport,
            UserComment.content.label("comment_content"),
            UserComment.post_id.label("comment_post_id"),
            User.name.label("comment_author_name"),
            User.phone.label("comment_author_phone"),
        )
        .join(UserComment, CommentReport.comment_id == UserComment.id)
        .join(User, UserComment.user_id == User.id, isouter=True)
    )

    # Also join reporter
    stmt = stmt.add_columns(
        User.name.label("reporter_name"),
        User.phone.label("reporter_phone"),
    ).join(User, CommentReport.reporter_id == User.id, isouter=True, from_joinpoint=True)

    # Actually we need a second User join for the reporter.
    # Let's use aliased User for the reporter.
    from sqlalchemy.orm import aliased

    Reporter = aliased(User, name="reporter")
    CommentAuthor = aliased(User, name="comment_author")

    stmt = (
        select(
            CommentReport,
            UserComment.content.label("comment_content"),
            UserComment.post_id.label("comment_post_id"),
            CommentAuthor.name.label("comment_author_name"),
            Reporter.name.label("reporter_name"),
            Reporter.phone.label("reporter_phone"),
        )
        .join(UserComment, CommentReport.comment_id == UserComment.id)
        .join(CommentAuthor, UserComment.user_id == CommentAuthor.id, isouter=True)
        .join(Reporter, CommentReport.reporter_id == Reporter.id, isouter=True)
    )

    if status:
        stmt = stmt.where(CommentReport.status == status)

    # Count total
    count_stmt = select(func.count(CommentReport.id))
    if status:
        count_stmt = count_stmt.where(CommentReport.status == status)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(CommentReport.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()

    # Get post snippets for the reported comments
    post_ids = list({r.comment_post_id for r in rows if r.comment_post_id})
    post_map: dict[str, str] = {}
    if post_ids:
        post_rows = (await db.execute(select(Post.id, Post.content).where(Post.id.in_(post_ids)))).all()
        post_map = {r[0]: (r[1][:60] + ("…" if len(r[1]) > 60 else "")) for r in post_rows}

    items = []
    for row in rows:
        report: CommentReport = row[0]
        items.append(
            {
                "id": report.id,
                "comment_id": report.comment_id,
                "comment_content": row.comment_content or "",
                "comment_author_name": row.comment_author_name,
                "reporter_id": report.reporter_id,
                "reporter_name": row.reporter_name or row.reporter_phone,
                "reason": report.reason,
                "status": report.status,
                "created_at": _dt_iso(report.created_at),
                "post_id": row.comment_post_id,
                "post_snippet": post_map.get(row.comment_post_id) if row.comment_post_id else None,
            }
        )

    return paginated(items, page=page, page_size=page_size, has_more=has_more(total, page, page_size))


async def resolve_report(db: AsyncSession, report_id: str, action: str) -> CommentReport:
    """Resolve a report: 'remove' deletes the comment, 'dismiss' keeps it.

    Fetches comment info before deletion so we can update post.comment_count.
    """
    result = await db.execute(select(CommentReport).where(CommentReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise ValueError("Report not found")

    if action == "remove":
        # Get the comment's post_id before deleting it
        cmt_result = await db.execute(select(UserComment).where(UserComment.id == report.comment_id))
        comment = cmt_result.scalar_one_or_none()
        if comment:
            # Decrement post comment count
            await db.execute(
                Post.__table__.update()
                .where(Post.id == comment.post_id)
                .values(
                    comment_count=case(
                        (Post.comment_count - 1 < 0, 0),
                        else_=Post.comment_count - 1,
                    )
                )
            )
            await db.delete(comment)

        report.status = "reviewed"
    elif action == "dismiss":
        report.status = "dismissed"
    else:
        raise ValueError(f"Invalid action: {action}")

    await commit_refresh(db, report)
    return report


async def list_admin_posts(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    keyword: str | None = None,
) -> dict:
    """List posts for admin management with author info and report counts."""

    # Subquery for report_count per post
    report_count_sub = (
        select(func.count(CommentReport.id))
        .join(UserComment, CommentReport.comment_id == UserComment.id)
        .where(UserComment.post_id == Post.id)
        .correlate(Post)
        .scalar_subquery()
    )

    stmt = select(
        Post,
        User.name.label("author_name"),
        User.phone.label("author_phone"),
        User.avatar_url.label("author_avatar_url"),
        User.level.label("author_level"),
        report_count_sub.label("report_count"),
    ).join(User, Post.user_id == User.id, isouter=True)

    if keyword and keyword.strip():
        k = keyword.strip().lower()
        stmt = stmt.where(
            (func.lower(Post.content).contains(k)) | (User.phone.contains(k)) | (func.lower(User.name).contains(k))
        )

    # Count total
    count_stmt = select(func.count(Post.id))
    if keyword and keyword.strip():
        k = keyword.strip().lower()
        count_stmt = count_stmt.join(User, Post.user_id == User.id, isouter=True).where(
            (func.lower(Post.content).contains(k)) | (User.phone.contains(k)) | (func.lower(User.name).contains(k))
        )
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(Post.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()

    items = []
    for row in rows:
        post: Post = row[0]
        items.append(
            {
                "id": post.id,
                "content": post.content,
                "post_type": post.post_type,
                "like_count": post.like_count,
                "comment_count": post.comment_count,
                "user_name": row.author_name,
                "user_avatar_url": row.author_avatar_url,
                "user_level": row.author_level,
                "user_id": post.user_id,
                "author_phone": row.author_phone,
                "is_pinned": False,
                "is_liked": False,
                "report_count": row.report_count or 0,
                "created_at": _dt_iso(post.created_at),
            }
        )

    return paginated(items, page=page, page_size=page_size, has_more=has_more(total, page, page_size))


async def admin_delete_post(db: AsyncSession, post_id: str) -> None:
    """Force-delete a post (admin override, no ownership check).

    Cascades: deletes all comments, comment likes, and comment reports
    before the post to avoid FK constraint errors (UserComment.post_id
    has no ondelete cascade).
    """
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise ValueError("Post not found")

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


async def list_admin_comments(db: AsyncSession, post_id: str) -> list[dict]:
    """List all comments for a post (admin view)."""
    stmt = (
        select(UserComment, User.name.label("author_name"), User.avatar_url.label("author_avatar_url"))
        .join(User, UserComment.user_id == User.id, isouter=True)
        .where(UserComment.post_id == post_id)
        .order_by(UserComment.created_at.asc())
    )
    rows = (await db.execute(stmt)).all()

    return [
        {
            "id": c.id,
            "post_id": c.post_id,
            "content": c.content,
            "user_id": c.user_id,
            "user_name": row.author_name,
            "user_avatar_url": row.author_avatar_url,
            "created_at": _dt_iso(c.created_at),
            "is_deleted": False,
        }
        for row in rows
        for c in [row[0]]
    ]


async def admin_delete_comment(db: AsyncSession, comment_id: str) -> None:
    """Force-delete a comment and decrement post.comment_count."""
    result = await db.execute(select(UserComment).where(UserComment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise ValueError("Comment not found")

    # Decrement post comment count (use CASE instead of GREATEST for SQLite compat)
    await db.execute(
        Post.__table__.update()
        .where(Post.id == comment.post_id)
        .values(
            comment_count=case(
                (Post.comment_count - 1 < 0, 0),
                else_=Post.comment_count - 1,
            )
        )
    )

    await db.delete(comment)
    await db.commit()


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


async def list_admin_orders(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """List all orders with user phone, paginated."""
    stmt = (
        select(Order, User.phone.label("user_phone"))
        .join(User, Order.user_id == User.id, isouter=True)
        .order_by(Order.created_at.desc())
    )

    total = (await db.execute(select(func.count(Order.id)))).scalar_one()

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()

    items = []
    for row in rows:
        order: Order = row[0]
        items.append(
            {
                "id": order.id,
                "order_number": order.order_number,
                "user_id": order.user_id,
                "user_phone": row.user_phone,
                "plan": order.plan,
                "amount": order.amount,
                "status": order.status.value if order.status else "pending",
                "paid_at": _dt_iso(order.paid_at),
                "created_at": _dt_iso(order.created_at),
            }
        )

    return paginated(items, page=page, page_size=page_size, has_more=has_more(total, page, page_size))
