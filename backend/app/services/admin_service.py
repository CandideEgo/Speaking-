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
from app.models.learning import LearningRecord, Vocabulary
from app.models.order import Order
from app.models.redeem import RedeemCode, RedeemStatus, RevokedReason
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


async def _count_online() -> int:
    """Count currently-online users via Redis ``presence:*`` keys (DEV-FLOW B2).

    Each heartbeat sets ``presence:{uid}`` with a 5-min TTL, so the key count
    is the real-time online number. Fails open to 0 if Redis is unavailable.
    """
    try:
        from app.core.redis import get_redis

        redis = get_redis()
        count = 0
        cursor = 0
        while True:
            cursor, keys = await redis.scan(cursor=cursor, match="presence:*", count=1000)
            count += len(keys)
            if cursor == 0:
                break
        return count
    except Exception:
        return 0


async def _gpu_queue_depth() -> int:
    """Depth of the ``transcription_gpu`` Celery queue (pending GPU work).

    Celery's Redis broker stores pending tasks in a list keyed by the queue
    name, so ``LLEN`` gives the backlog. Fails open to 0 if Redis is
    unavailable.
    """
    try:
        from app.core.config import get_settings
        from app.core.redis import get_redis

        redis = get_redis()
        return int(await redis.llen(get_settings().transcription_gpu_queue_name))
    except Exception:
        return 0


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

    # Active users: users whose last_active_at falls in the window
    active_users_today = (
        await db.execute(select(func.count(User.id)).where(func.date(User.last_active_at) == today))
    ).scalar_one()
    active_users_7d = (await db.execute(select(func.count(User.id)).where(User.last_active_at >= ago_7d))).scalar_one()

    # --- Real-time / today KPIs (DEV-FLOW 2026-07 Phase B2) ---
    online_now = await _count_online()
    gpu_queue_depth = await _gpu_queue_depth()
    videos_error_count = (
        await db.execute(select(func.count(Video.id)).where(Video.status == VideoStatus.error))
    ).scalar_one()
    signups_today = (
        await db.execute(select(func.count(User.id)).where(func.date(User.created_at) == today))
    ).scalar_one()
    redeems_today = (
        await db.execute(
            select(func.count(RedeemCode.id)).where(
                RedeemCode.status == RedeemStatus.redeemed,
                func.date(RedeemCode.used_at) == today,
            )
        )
    ).scalar_one()

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

    # --- Recent activity (merge-sort from signups + paid orders) ---
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
        "active_users_today": active_users_today,
        "active_users_7d": active_users_7d,
        "online_now": online_now,
        "gpu_queue_depth": gpu_queue_depth,
        "videos_error_count": videos_error_count,
        "signups_today": signups_today,
        "redeems_today": redeems_today,
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

    stmt = select(
        User,
        vw_count.label("videos_watched"),
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
# Redeem code management (ADR-0007)
# ---------------------------------------------------------------------------


async def revoke_redeem_code(db: AsyncSession, code_id: str, reason: str) -> RedeemCode:
    """Admin voids an *unused* code (leak / error). Terminal -> revoked.

    Only unused codes can be voided this way; refunding an already-redeemed
    code (clawing back the granted time) is a separate operation
    (``refund_redeem_code``) because it must also mutate the user's plan.
    """
    result = await db.execute(select(RedeemCode).where(RedeemCode.id == code_id).with_for_update())
    code = result.scalar_one_or_none()
    if not code:
        raise ValueError("Redeem code not found")
    if code.status != RedeemStatus.unused:
        raise ValueError(f"Only unused codes can be revoked (current status: {code.status.value})")

    code.status = RedeemStatus.revoked
    code.revoked_reason = RevokedReason(reason)
    await commit_refresh(db, code)
    return code


async def refund_redeem_code(db: AsyncSession, code_id: str) -> tuple[RedeemCode, User]:
    """Admin refund clawback on an already-REDEEMED code (ADR-0007).

    Atomic within one transaction: lock the code row, then the user row, set
    the code to ``revoked(reason=refund)``, and claw back ``duration_days``
    from ``user.plan_expires_at`` (not below now). If the remaining expiry
    drops to <= now, downgrade the user to free. Full refund == full
    clawback; fair and simple (no pro-rating).

    Returns ``(code, user)``. Raises ``ValueError`` if the code is not in the
    redeemed state, or if its user no longer exists (the code is still revoked
    in that case but no plan change is possible).
    """
    result = await db.execute(select(RedeemCode).where(RedeemCode.id == code_id).with_for_update())
    code = result.scalar_one_or_none()
    if not code:
        raise ValueError("Redeem code not found")
    if code.status != RedeemStatus.redeemed:
        raise ValueError(f"Only redeemed codes can be refunded (current status: {code.status.value})")

    # Mark the code revoked regardless of what happens to the user.
    code.status = RedeemStatus.revoked
    code.revoked_reason = RevokedReason.refund

    if not code.used_by:
        # Redeemed but no user recorded (data integrity edge): revoke only.
        await commit_refresh(db, code)
        raise ValueError("Redeem code has no associated user; revoked without plan change")

    user_result = await db.execute(select(User).where(User.id == code.used_by).with_for_update())
    user = user_result.scalar_one_or_none()
    if not user:
        # User was deleted; the FK on redeem_codes.used_by is SET NULL, but we
        # still hold the in-memory used_by from before the lock. Revoke only.
        await commit_refresh(db, code)
        raise ValueError("Redeem code's user no longer exists; revoked without plan change")

    now = datetime.now(UTC)
    current_expires = _to_aware_utc(user.plan_expires_at) if user.plan_expires_at else now
    new_expires = current_expires - timedelta(days=code.duration_days)
    if new_expires <= now:
        user.plan = PlanType.free
        user.plan_expires_at = None
    else:
        # Keep plan=pro with the shortened expiry. (If the user was somehow
        # already free, leave the plan but record the remaining time.)
        if user.plan == PlanType.pro:
            user.plan_expires_at = new_expires

    await commit_refresh(db, code)
    return code, user


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
