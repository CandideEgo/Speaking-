"""Admin service — business logic for the admin panel endpoints.

All functions receive an ``AsyncSession`` and return plain dicts or model
instances that the route handler serialises via Pydantic schemas.
"""

import json
import logging
from datetime import UTC, datetime, timedelta
from enum import Enum

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.time_utils import to_aware_utc
from app.models.admin_setting import SETTINGS_ROW_ID, AdminSetting
from app.models.jinshuju_payment import JinshujuPayment, JinshujuPaymentStatus
from app.models.learning import LearningRecord, Vocabulary
from app.models.order import Order
from app.models.user import PlanType, RoleType, User
from app.models.video import Video, VideoStatus
from app.schemas.pagination import paginated

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

# The dashboard is polled by admins every 60s; recomputing ~15 aggregates per
# hit is wasteful. Cache the whole payload in Redis for a short TTL — fresh
# enough for an ops dashboard, cheap enough to serve many admins at once.
_STATS_CACHE_TTL = 30  # seconds


async def get_admin_stats(db: AsyncSession, days: int = 30) -> dict:
    """Aggregate dashboard KPIs, trend data, distributions, and recent activity.

    Wraps :func:`_compute_admin_stats` with a short-lived Redis cache
    (fails open — a Redis outage just means no caching).
    """
    cache_key = f"cache:admin_stats:{days}"
    try:
        from app.core.redis import get_redis

        cached = await get_redis().get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        logger.debug("admin_stats cache read failed — computing fresh", exc_info=True)

    result = await _compute_admin_stats(db, days)

    try:
        from app.core.redis import get_redis

        await get_redis().set(cache_key, json.dumps(jsonable_encoder(result)), ex=_STATS_CACHE_TTL)
    except Exception:
        logger.debug("admin_stats cache write failed", exc_info=True)

    return result


async def _compute_admin_stats(db: AsyncSession, days: int = 30) -> dict:
    """Compute the dashboard payload from scratch (see get_admin_stats)."""

    now = datetime.now(UTC)
    ago_7d = now - timedelta(days=7)
    ago_nd = now - timedelta(days=days)
    today = now.date()

    # --- KPI counts ---
    # All user-level counters in ONE scan via conditional aggregation
    # (previously 7 separate COUNT queries).
    #
    # ADM-05: ``pro_users`` counts **active** Pro only (plan == pro AND not
    # expired). The ``plan`` column is never downgraded by any beat job — an
    # expiry silently leaves ``plan='pro'`` behind — so counting the stored
    # plan overstates the paying base (audit measured 611 stored vs 284 active).
    # ``pro_expired_count`` keeps the lapsed rows visible, and ``users_by_plan``
    # below intentionally stays an as-stored distribution (see its comment).
    active_pro_condition = or_(User.plan_expires_at.is_(None), User.plan_expires_at > now)
    (
        total_users,
        new_users_7d,
        pro_users,
        active_users_today,
        active_users_7d,
        signups_today,
        pro_expired_count,
    ) = (
        await db.execute(
            select(
                func.count(User.id),
                func.count(User.id).filter(User.created_at >= ago_7d),
                func.count(User.id).filter(User.plan == PlanType.pro, active_pro_condition),
                func.count(User.id).filter(func.date(User.last_active_at) == today),
                func.count(User.id).filter(User.last_active_at >= ago_7d),
                func.count(User.id).filter(func.date(User.created_at) == today),
                func.count(User.id).filter(
                    User.plan == PlanType.pro,
                    User.plan_expires_at.is_not(None),
                    User.plan_expires_at < now,
                ),
            )
        )
    ).one()

    # Vocabulary KPI — replaces the retired speaking-attempts count (ADR-0003):
    # speaking progress tracking is gone; vocabulary is the active learning metric.
    total_vocabulary = (await db.execute(select(func.count(Vocabulary.id)))).scalar_one()

    # --- Real-time / today KPIs (DEV-FLOW 2026-07 Phase B2) ---
    online_now = await _count_online()
    gpu_queue_depth = await _gpu_queue_depth()

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
    # the retired speaking-attempts trend (ADR-0003) — vocabulary is the active
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
    # One GROUP BY replaces three queries (total / ready / error counts are
    # derived from the per-status rows).
    videos_by_status_rows = (await db.execute(select(Video.status, func.count(Video.id)).group_by(Video.status))).all()
    videos_by_status = [{"status": r[0], "count": r[1]} for r in videos_by_status_rows]
    status_counts = {r[0]: r[1] for r in videos_by_status_rows}
    total_videos = sum(status_counts.values())
    videos_ready = status_counts.get(VideoStatus.ready, 0)
    videos_error_count = status_counts.get(VideoStatus.error, 0)

    # As-stored plan distribution: buckets the ``plan`` column verbatim, so the
    # ``pro`` bucket includes lapsed memberships (ADM-05). Active Pro is
    # ``pro_users`` above; the delta between the two is ``pro_expired_count``.
    users_by_plan_rows = (await db.execute(select(User.plan, func.count(User.id)).group_by(User.plan))).all()
    users_by_plan = [{"plan": r[0], "count": r[1]} for r in users_by_plan_rows]

    # --- Video topic distribution (prototype 31: 视频分类分布) ---
    # topic_tags is a comma-separated string column; aggregate in Python.
    topic_rows = (await db.execute(select(Video.topic_tags).where(Video.is_published.is_(True)))).scalars().all()
    topic_counts: dict[str, int] = {}
    for tags in topic_rows:
        if not tags:
            continue
        for tag in tags.split(","):
            tag = tag.strip()
            if tag:
                topic_counts[tag] = topic_counts.get(tag, 0) + 1
    videos_by_topic = [
        {"topic": t, "count": c} for t, c in sorted(topic_counts.items(), key=lambda kv: kv[1], reverse=True)[:8]
    ]

    # --- Pro conversion funnel (prototype 31: 注册 -> 观看 -> 收藏词汇 -> Pro) ---
    watched_users = (await db.execute(select(func.count(func.distinct(LearningRecord.user_id))))).scalar_one()
    vocab_users = (await db.execute(select(func.count(func.distinct(Vocabulary.user_id))))).scalar_one()
    funnel = {
        "registered": total_users,
        "watched": int(watched_users or 0),
        "vocab_saved": int(vocab_users or 0),
        # ADM-05: funnel must use the same active-Pro definition as ``pro_users``,
        # otherwise the last stage shows stored (mostly expired) plans.
        "pro": pro_users,
    }

    # --- Recent activity (merge-sort from signups + 金数据 payments) ---
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
    # dead feature.)

    # 金数据 payments (ADM-06) — the live revenue source. Applied purchases show
    # as "开通 Pro"; pending ones (paid but the account isn't registered yet)
    # still deserve a line so ops can spot missing grants. The legacy ``orders``
    # table is kept as a fallback for pre-Jinshuju history only.
    payment_rows = (
        await db.execute(
            select(JinshujuPayment, User.name, User.phone)
            .outerjoin(User, JinshujuPayment.user_id == User.id)
            .where(JinshujuPayment.status.in_([JinshujuPaymentStatus.APPLIED, JinshujuPaymentStatus.PENDING]))
            .order_by(
                func.coalesce(JinshujuPayment.entry_created_at, JinshujuPayment.created_at).desc(),
                JinshujuPayment.id.desc(),
            )
            .limit(8)
        )
    ).all()
    for payment, name, linked_phone in payment_rows:
        paid_at = payment.entry_created_at or payment.created_at
        who = name or linked_phone or payment.phone or "用户"
        tier = payment.tier_name or "Pro"
        amount = f"（¥{payment.amount_fen / 100:.0f}）" if payment.amount_fen is not None else ""
        state = "开通 Pro" if payment.status == JinshujuPaymentStatus.APPLIED else "付款待开通"
        recent.append(
            {
                "id": f"payment-{payment.id}",
                "type": "payment",
                "summary": f"{who} {state} {tier}{amount}",
                "created_at": _dt_iso(paid_at),
            }
        )

    if not payment_rows:
        # Legacy fallback: rows written before the Jinshuju收款链路 switched over.
        for o in (
            await db.execute(
                select(Order, User.name, User.phone)
                .join(User, Order.user_id == User.id)
                .where(Order.status == "paid")
                .order_by(Order.created_at.desc(), Order.id.desc())
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
        "trend": {
            "dates": dates_list,
            "signups": signups_list,
            "vocabulary": vocab_list,
            "active_users": active_list,
        },
        "videos_by_status": videos_by_status,
        "users_by_plan": users_by_plan,
        "recent_activity": recent,
        "pro_expired_count": int(pro_expired_count or 0),
        "funnel": funnel,
        "videos_by_topic": videos_by_topic,
    }


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------


#: 管理列表 keyword 的长度上限（ADM-11：避免把整段文本当 LIKE 模式拖慢全表扫描）。
_ADMIN_KEYWORD_MAX_LEN = 100

#: PostgreSQL INTEGER（``jinshuju_payments.serial_number``）的上界。
_INT32_MAX = 2_147_483_647


def _like_escape(value: str) -> str:
    """Escape LIKE metacharacters (``%`` / ``_``) and the escape char itself.

    Same approach as ``video_service``: pass ``escape="\\"`` to every LIKE and
    escape the user input first. Without this, searching for ``%`` matches the
    whole table (ADM-11).
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _parse_enum_filter(value: str, enum_cls: type[Enum], label: str):
    """Turn a raw filter string into an enum member, 400 on unknown values.

    The routes already validate via ``Literal`` (422); this is the defensive
    service-layer guard for direct callers, and it replaces the old
    ``except ValueError: pass`` that silently returned the unfiltered list.
    """
    try:
        return enum_cls(value)
    except ValueError as exc:
        allowed = "/".join(str(member.value) for member in enum_cls)
        raise BadRequestError(f"无效的{label}过滤值：{value}（可选 {allowed}）") from exc


async def list_admin_users(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    role: str | None = None,
    plan: str | None = None,
    keyword: str | None = None,
) -> dict:
    """List users with aggregated stats, filtered by role/plan/keyword.

    ``plan`` accepts ``free`` / ``pro`` / ``expired`` — the latter matches
    users whose Pro membership has lapsed (prototype 28 已过期 filter).

    Filter values are validated instead of silently ignored (ADM-11), the
    keyword is LIKE-escaped and length-capped, and ordering carries an ``id``
    tiebreaker so OFFSET pagination cannot duplicate/skip rows with equal
    ``created_at`` timestamps (ADM-10).
    """

    now = datetime.now(UTC)

    # Subqueries for aggregated counts.
    # Note: speaking-attempt counts are intentionally omitted — AI speaking
    # scoring was removed (ADR-0002/0003), so a per-user speaking count is
    # dead data.
    vw_count = (
        select(func.count(LearningRecord.id)).where(LearningRecord.user_id == User.id).correlate(User).scalar_subquery()
    )
    lw_count = select(func.count(Vocabulary.id)).where(Vocabulary.user_id == User.id).correlate(User).scalar_subquery()

    stmt = select(
        User,
        vw_count.label("videos_watched"),
        lw_count.label("learned_words"),
    )

    def _apply_filters(s):
        if role:
            s = s.where(User.role == _parse_enum_filter(role, RoleType, "角色"))
        if plan:
            if plan == "expired":
                s = s.where(
                    User.plan == PlanType.pro,
                    User.plan_expires_at.is_not(None),
                    User.plan_expires_at < now,
                )
            else:
                s = s.where(User.plan == _parse_enum_filter(plan, PlanType, "方案"))
        if keyword and keyword.strip():
            k = keyword.strip().lower()
            if len(k) > _ADMIN_KEYWORD_MAX_LEN:
                raise BadRequestError(f"搜索关键词最长 {_ADMIN_KEYWORD_MAX_LEN} 个字符")
            pattern = f"%{_like_escape(k)}%"
            s = s.where(func.lower(User.name).like(pattern, escape="\\") | User.phone.like(pattern, escape="\\"))
        return s

    stmt = _apply_filters(stmt)

    # Count total for has_more
    count_stmt = _apply_filters(select(func.count(User.id)))
    total = (await db.execute(count_stmt)).scalar_one()

    # Paginate. ``User.id`` is the deterministic tiebreaker (ADM-10).
    stmt = stmt.order_by(User.created_at.desc(), User.id).offset((page - 1) * page_size).limit(page_size)
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
                "gender": user.gender,
                "level": user.level,
                "plan": user.plan.value if user.plan else "free",
                "plan_expires_at": _dt_iso(user.plan_expires_at),
                "timezone": user.timezone,
                "role": user.role.value if user.role else "user",
                "is_banned": user.is_banned,
                "created_at": _dt_iso(user.created_at),
                "last_active_at": _dt_iso(user.last_active_at),
                "videos_watched": int(row[1] or 0),
                "learned_words": int(row[2] or 0),
            }
        )

    return paginated(items, page=page, page_size=page_size, total=total)


# ---------------------------------------------------------------------------
# Admin settings (prototype 32 系统设置)
# ---------------------------------------------------------------------------


#: 首次创建设置单例各尝试几次（并发首建撞主键后重读）。
_SETTINGS_INSERT_ATTEMPTS = 3


async def _select_admin_settings(db: AsyncSession) -> AdminSetting | None:
    result = await db.execute(select(AdminSetting).where(AdminSetting.id == SETTINGS_ROW_ID))
    return result.scalar_one_or_none()


async def get_admin_settings(db: AsyncSession) -> AdminSetting:
    """Return the singleton settings row, creating it with defaults if absent.

    ADM-14: two concurrent first visits (fresh deploy, or two admins hitting
    the settings page before anyone saved it) used to race the plain
    ``add + commit`` into a primary-key ``IntegrityError`` → 500. The insert is
    now wrapped in a SAVEPOINT: the loser re-reads the winner's row instead of
    aborting the whole transaction (same pattern as
    ``home_content_service._get_or_create_*``).
    """
    settings = await _select_admin_settings(db)
    if settings is not None:
        return settings
    for _ in range(_SETTINGS_INSERT_ATTEMPTS):
        candidate = AdminSetting(id=SETTINGS_ROW_ID)
        try:
            async with db.begin_nested():
                db.add(candidate)
                await db.flush()
        except IntegrityError:
            # SAVEPOINT rollback leaves the (never-persisted) candidate attached.
            if candidate in db:
                db.expunge(candidate)
            settings = await _select_admin_settings(db)
            if settings is not None:
                return settings
            continue
        await db.commit()
        await db.refresh(candidate)
        return candidate
    raise ConflictError("系统设置初始化冲突，请重试")


async def update_admin_settings(db: AsyncSession, patch: dict) -> AdminSetting:
    """Apply a partial update to the singleton settings row.

    Cross-field validation happens **before** mutating the ORM object (ADM-14):
    a rejected patch must not leave half-applied attributes on the session
    (a later request on the same session would see them, and ``rollback`` is
    not called by the error handler).

    Raises ``BadRequestError`` if the thresholds are inconsistent
    (warn threshold must be >= block threshold).
    """
    settings = await get_admin_settings(db)

    # Merge the patch with the current values on plain python floats, then
    # validate — only after that touch the instance.
    block_t = float(patch.get("quality_block_threshold", settings.quality_block_threshold))
    warn_t = float(patch.get("quality_warn_threshold", settings.quality_warn_threshold))
    if warn_t < block_t:
        raise BadRequestError("警告阈值不能低于阻塞阈值")

    for key, value in patch.items():
        if value is not None:
            setattr(settings, key, value)
    await commit_refresh(db, settings)
    return settings


async def list_admin_accounts(db: AsyncSession) -> list[dict]:
    """All accounts with role=admin (settings page 管理员账户 list)."""
    rows = (
        (await db.execute(select(User).where(User.role == RoleType.admin).order_by(User.created_at.asc())))
        .scalars()
        .all()
    )
    return [
        {
            "id": u.id,
            "name": u.name,
            "phone": u.phone,
            "last_active_at": _dt_iso(u.last_active_at),
        }
        for u in rows
    ]


# ---------------------------------------------------------------------------
# User actions (ban / role / plan)
# ---------------------------------------------------------------------------


async def _get_user_or_raise(db: AsyncSession, user_id: str) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found")
    return user


async def _lock_admin_rows(db: AsyncSession) -> list[User]:
    """Lock every admin row (stable ``id`` order) and return the fresh state.

    ADM-09 last-admin protection needs a serialisation point: two admins
    banning/demoting each other can both pass a plain "is there another admin"
    read under READ COMMITTED and commit into zero usable admins. Locking all
    admin rows in one deterministic order turns those transactions into a
    queue (no deadlock, one waits), and ``populate_existing`` makes the waiter
    re-read the state committed by the transaction it just waited for.
    """
    result = await db.execute(
        select(User)
        .where(User.role == RoleType.admin)
        .order_by(User.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return list(result.scalars().all())


def _assert_not_last_admin(admins: list[User], user_id: str) -> None:
    """409 when removing ``user_id`` would leave zero usable admins.

    ``admins`` is the locked admin set; usable = not banned. Called only for
    actions that actually remove admin usability (ban / demote).
    """
    target = next((a for a in admins if a.id == user_id), None)
    if target is None or target.is_banned:
        return  # Not an active admin → nothing to lose.
    others = sum(1 for a in admins if a.id != user_id and not a.is_banned)
    if others == 0:
        raise ConflictError("不能移除最后一名可用管理员：请先授予其他账号管理员权限")


async def ban_user(db: AsyncSession, user_id: str, is_banned: bool, admin_user_id: str) -> User:
    if user_id == admin_user_id:
        raise BadRequestError("Cannot ban yourself")
    user = await _get_user_or_raise(db, user_id)
    if is_banned and user.role == RoleType.admin:
        # Lock all admin rows *before* deciding — see _lock_admin_rows.
        admins = await _lock_admin_rows(db)
        _assert_not_last_admin(admins, user_id)
    user.is_banned = is_banned
    await commit_refresh(db, user)
    logger.info("admin_action ban_user actor=%s target=%s banned=%s", admin_user_id, user_id, is_banned)
    return user


async def change_user_role(db: AsyncSession, user_id: str, role: str, admin_user_id: str) -> User:
    if user_id == admin_user_id:
        raise BadRequestError("Cannot change your own role")
    new_role = _parse_enum_filter(role, RoleType, "角色")
    user = await _get_user_or_raise(db, user_id)
    if new_role == RoleType.user and user.role == RoleType.admin:
        # Demotion is the other way to remove the last usable admin (ADM-09).
        admins = await _lock_admin_rows(db)
        _assert_not_last_admin(admins, user_id)
    user.role = new_role
    await commit_refresh(db, user)
    logger.info("admin_action change_user_role actor=%s target=%s role=%s", admin_user_id, user_id, role)
    return user


async def change_user_plan(db: AsyncSession, user_id: str, plan: str, duration_days: int, admin_user_id: str) -> User:
    # Lock the User row to prevent race with concurrent payment callback
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found")
    new_plan = _parse_enum_filter(plan, PlanType, "方案")
    user.plan = new_plan
    if new_plan == PlanType.pro:
        now = datetime.now(UTC)
        current_expires = to_aware_utc(user.plan_expires_at) if user.plan_expires_at else now
        base = max(current_expires, now)
        user.plan_expires_at = base + timedelta(days=duration_days)
        # ADM-17: provenance must say "admin" — otherwise a manual grant keeps
        # whatever source the account had before (e.g. "trial") or stays NULL,
        # and exports/source breakdowns lie about where Pro came from.
        user.plan_source = "admin"
    else:
        user.plan_expires_at = None
        user.plan_source = None
    await commit_refresh(db, user)
    logger.info(
        "admin_action change_user_plan actor=%s target=%s plan=%s duration_days=%s",
        admin_user_id,
        user_id,
        plan,
        duration_days,
    )
    return user


# ---------------------------------------------------------------------------
# 金数据 payments (replaces the dead legacy ``orders`` admin surface)
# ---------------------------------------------------------------------------

#: Valid ``JinshujuPayment.status`` filter values. The route already restricts
#: via ``Literal`` (422); this set is the service-layer guard for direct calls.
_PAYMENT_STATUS_VALUES = frozenset(
    {
        JinshujuPaymentStatus.APPLIED,
        JinshujuPaymentStatus.PENDING,
        JinshujuPaymentStatus.IGNORED,
        JinshujuPaymentStatus.REFUNDED,
        JinshujuPaymentStatus.ERROR,
    }
)

#: 已发放（= 钱到账且会员已开）才计入收入；退款/挂起/异常一律不算。
_PAID_STATUS = JinshujuPaymentStatus.APPLIED


def _parse_payment_status(value: str) -> str:
    if value not in _PAYMENT_STATUS_VALUES:
        allowed = "/".join(sorted(_PAYMENT_STATUS_VALUES))
        raise BadRequestError(f"无效的付款状态过滤值：{value}（可选 {allowed}）")
    return value


def _payment_paid_at():
    """Payment time expression: Jinshuju entry time, falling back to ingest time."""
    return func.coalesce(JinshujuPayment.entry_created_at, JinshujuPayment.created_at)


async def list_admin_payments(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    keyword: str | None = None,
) -> dict:
    """List 金数据 payment records (LEFT JOIN the linked account), paginated.

    - ``phone`` in each row is the display phone: linked account phone first,
      then the phone typed on the Jinshuju form (``COALESCE``). Records that
      have not been matched to an account yet (``user_id IS NULL``) still show
      the buyer's phone.
    - ``keyword`` matches the payment phone / linked account phone / trade
      number / tier name, plus an exact numeric ``serial_number`` match; LIKE
      metacharacters are escaped.
    - Stable ordering: ``entry_created_at DESC NULLS LAST, created_at DESC,
      id DESC`` so OFFSET pagination cannot duplicate/skip rows.
    - ``raw_json`` is never selected or returned.
    """

    def _apply_filters(s):
        if status:
            s = s.where(JinshujuPayment.status == _parse_payment_status(status))
        if keyword and keyword.strip():
            k = keyword.strip().lower()
            if len(k) > _ADMIN_KEYWORD_MAX_LEN:
                raise BadRequestError(f"搜索关键词最长 {_ADMIN_KEYWORD_MAX_LEN} 个字符")
            pattern = f"%{_like_escape(k)}%"
            conditions = or_(
                func.lower(JinshujuPayment.phone).like(pattern, escape="\\"),
                func.lower(User.phone).like(pattern, escape="\\"),
                func.lower(JinshujuPayment.trade_no).like(pattern, escape="\\"),
                func.lower(JinshujuPayment.tier_name).like(pattern, escape="\\"),
            )
            if k.isdigit() and 0 < int(k) <= _INT32_MAX:
                # 数据序号可以整段输入（例如 1024）→ 精确匹配，避免被 like 吃掉。
                # 必须挡 int32：``serial_number`` 是 INTEGER（4 字节），把 11 位
                # 手机号塞进去会让 asyncpg 抛 "value out of int32 range" → 500。
                # （SQLite 测试库不校验整数范围，这个坑只在 Postgres 上暴露。）
                conditions = or_(conditions, JinshujuPayment.serial_number == int(k))
            s = s.where(conditions)
        return s

    stmt = _apply_filters(
        select(
            JinshujuPayment,
            User.phone.label("user_phone"),
            User.name.label("user_name"),
            func.coalesce(User.phone, JinshujuPayment.phone).label("display_phone"),
        ).outerjoin(User, JinshujuPayment.user_id == User.id)
    )

    count_stmt = _apply_filters(
        select(func.count(JinshujuPayment.id))
        .select_from(JinshujuPayment)
        .outerjoin(User, JinshujuPayment.user_id == User.id)
    )
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        stmt.order_by(
            JinshujuPayment.entry_created_at.desc().nullslast(),
            JinshujuPayment.created_at.desc(),
            JinshujuPayment.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()

    items = []
    for payment, user_phone, user_name, display_phone in rows:
        items.append(
            {
                "id": payment.id,
                "entry_token": payment.entry_token,
                "serial_number": payment.serial_number,
                "phone": display_phone,
                "user_id": payment.user_id,
                "user_phone": user_phone,
                "user_name": user_name,
                "tier_name": payment.tier_name,
                "amount_fen": payment.amount_fen,
                "duration_days": payment.duration_days,
                "trade_status": payment.trade_status,
                "trade_no": payment.trade_no,
                "payment_method": payment.payment_method,
                "status": payment.status,
                "error_message": payment.error_message,
                "entry_created_at": _dt_iso(payment.entry_created_at),
                "created_at": _dt_iso(payment.created_at),
                "applied_at": _dt_iso(payment.applied_at),
            }
        )

    return paginated(items, page=page, page_size=page_size, total=total)


async def payment_summary(db: AsyncSession) -> dict:
    """Status counters + revenue sums for the payments page (single query).

    Revenue = sum of ``amount_fen`` for ``applied`` records (paid **and**
    granted); refunded/pending/ignored/error rows are excluded. ``paid_today_*``
    and ``paid_30d_*`` window on the payment time (``entry_created_at`` with
    ``created_at`` fallback) using a UTC day boundary, while ``applied_today``
    counts grants applied today (``applied_at``).
    """
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    ago_30d = now - timedelta(days=30)
    paid_at = _payment_paid_at()

    row = (
        await db.execute(
            select(
                func.count(JinshujuPayment.id).filter(JinshujuPayment.status == JinshujuPaymentStatus.APPLIED),
                func.count(JinshujuPayment.id).filter(JinshujuPayment.status == JinshujuPaymentStatus.PENDING),
                func.count(JinshujuPayment.id).filter(JinshujuPayment.status == JinshujuPaymentStatus.IGNORED),
                func.count(JinshujuPayment.id).filter(JinshujuPayment.status == JinshujuPaymentStatus.REFUNDED),
                func.count(JinshujuPayment.id).filter(JinshujuPayment.status == JinshujuPaymentStatus.ERROR),
                func.coalesce(func.sum(JinshujuPayment.amount_fen).filter(JinshujuPayment.status == _PAID_STATUS), 0),
                func.coalesce(
                    func.sum(JinshujuPayment.amount_fen).filter(
                        JinshujuPayment.status == _PAID_STATUS, paid_at >= ago_30d
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(JinshujuPayment.amount_fen).filter(
                        JinshujuPayment.status == _PAID_STATUS, paid_at >= today_start
                    ),
                    0,
                ),
                func.count(JinshujuPayment.id).filter(
                    JinshujuPayment.status == _PAID_STATUS, JinshujuPayment.applied_at >= today_start
                ),
            )
        )
    ).one()

    return {
        "applied": int(row[0] or 0),
        "pending": int(row[1] or 0),
        "ignored": int(row[2] or 0),
        "refunded": int(row[3] or 0),
        "error": int(row[4] or 0),
        "paid_total_fen": int(row[5] or 0),
        "paid_30d_fen": int(row[6] or 0),
        "paid_today_fen": int(row[7] or 0),
        "applied_today": int(row[8] or 0),
    }


def enqueue_payment_sync(admin_user_id: str) -> bool:
    """Enqueue the existing Jinshuju sync Celery task. Never does inline HTTP.

    Returns ``False`` when the integration is disabled/unconfigured (there is
    nothing to sync) or when the broker rejects the dispatch. The task itself
    re-checks configuration and failures bubble up to Celery (autoretry).
    """
    from app.core.config import get_settings

    settings = get_settings()
    if not (
        settings.jinshuju_enabled and settings.jinshuju_access_token.strip() and settings.jinshuju_form_token.strip()
    ):
        logger.info("admin_action payments_sync actor=%s skipped=unconfigured", admin_user_id)
        return False
    from app.tasks.payment_tasks import sync_jinshuju_payments

    try:
        sync_jinshuju_payments.delay()
    except Exception:
        logger.warning("admin_action payments_sync actor=%s enqueue_failed", admin_user_id, exc_info=True)
        return False
    logger.info("admin_action payments_sync actor=%s queued", admin_user_id)
    return True
