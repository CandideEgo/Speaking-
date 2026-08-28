"""Free-tier video unlock quota — domain logic for the D0 membership model.

Rules (产品设计规划-2026-08 §2.2, .agent/decisions.md 2026-08-28):

- Free users may unlock ``settings.free_monthly_unlock_quota`` videos per
  calendar month; each unlock is **permanent** (row in ``user_video_unlocks``).
- Quotas reset on the 1st of each month; unused quotas do not roll over.
- Pro users, admins and ``is_demo`` videos never consume quota and never
  write unlock rows.
- Unlocking is idempotent: re-unlocking an already-unlocked video consumes
  nothing (composite PK guards concurrent races too).
"""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.user import PlanType, RoleType, User
from app.models.user_video_unlock import UserVideoUnlock
from app.models.video import Video


class UnlockQuotaExhaustedError(Exception):
    """Raised when a Free user tries to unlock with no quota left this month."""

    def __init__(self, remaining: int, quota: int) -> None:
        self.remaining = remaining
        self.quota = quota
        super().__init__("本月解锁次数已用完")


def is_active_pro(user: User | None) -> bool:
    """True iff the user is on an unexpired Pro plan (trial counts as Pro).

    Mirrors the frontend ``isProUser`` helper: the downgrade beat runs hourly,
    so between expiry and the next tick ``plan`` is still ``pro`` — the expiry
    check keeps the gate honest in that window.
    """
    if user is None or user.plan != PlanType.pro:
        return False
    if user.plan_expires_at is None:
        return True
    expires = user.plan_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return expires > datetime.now(UTC)


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def count_month_unlocks(db: AsyncSession, user_id: str, now: datetime | None = None) -> int:
    """Number of unlocks consumed in the current calendar month."""
    moment = now or datetime.now(UTC)
    used = await db.scalar(
        select(func.count())
        .select_from(UserVideoUnlock)
        .where(
            UserVideoUnlock.user_id == user_id,
            UserVideoUnlock.unlocked_at >= _month_start(moment),
        )
    )
    return used or 0


async def remaining_unlocks(db: AsyncSession, user: User, now: datetime | None = None) -> int:
    quota = get_settings().free_monthly_unlock_quota
    used = await count_month_unlocks(db, user.id, now)
    return max(0, quota - used)


async def is_unlocked(db: AsyncSession, user_id: str, video_id: str) -> bool:
    return await db.get(UserVideoUnlock, (user_id, video_id)) is not None


async def get_video_access_info(db: AsyncSession, user: User | None, video: Video) -> dict:
    """Build the ``access`` payload embedded in the video detail response.

    Shape: ``{unlocked: bool, remaining_this_month: int | None, quota: int}``.
    ``remaining_this_month`` is None for Pro/admin viewers (unlimited); for
    Free/anonymous viewers it reports the current month's remaining quotas.
    """
    quota = get_settings().free_monthly_unlock_quota
    if user is not None and (user.role == RoleType.admin or is_active_pro(user)):
        return {"unlocked": True, "remaining_this_month": None, "quota": quota}
    if video.is_demo:
        remaining = await remaining_unlocks(db, user) if user is not None else quota
        return {"unlocked": True, "remaining_this_month": remaining, "quota": quota}
    if user is None:
        return {"unlocked": False, "remaining_this_month": quota, "quota": quota}
    unlocked = await is_unlocked(db, user.id, video.id)
    remaining = await remaining_unlocks(db, user)
    return {"unlocked": unlocked, "remaining_this_month": remaining, "quota": quota}


async def unlock_video(db: AsyncSession, user: User, video: Video) -> dict:
    """Consume one monthly quota to permanently unlock ``video``.

    Idempotent: an already-unlocked video returns success without consuming
    quota. Raises ``UnlockQuotaExhaustedError`` when the month's quota is spent.
    Returns the post-unlock access info.
    """
    if video.is_demo or user.role == RoleType.admin or is_active_pro(user):
        return await get_video_access_info(db, user, video)

    if await is_unlocked(db, user.id, video.id):
        return await get_video_access_info(db, user, video)

    if await remaining_unlocks(db, user) <= 0:
        raise UnlockQuotaExhaustedError(remaining=0, quota=get_settings().free_monthly_unlock_quota)

    db.add(UserVideoUnlock(user_id=user.id, video_id=video.id))
    try:
        await db.commit()
    except IntegrityError:
        # Concurrent duplicate unlock raced past the check above — the row
        # exists now, which is exactly the desired end state.
        await db.rollback()
    return await get_video_access_info(db, user, video)


async def list_unlocked_videos(db: AsyncSession, user: User, page: int = 1, page_size: int = 20) -> dict:
    """Paginated list of the user's unlocked videos (newest unlock first).

    Powers the /history 「已解锁」 tab. Videos that were later unpublished or
    dropped out of ready are filtered out so the list only links to watchable
    content.
    """
    from app.models.video import VideoStatus
    from app.schemas.pagination import paginated
    from app.schemas.video import VideoResponse

    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    offset = (page - 1) * page_size

    base = (
        select(UserVideoUnlock, Video)
        .join(Video, Video.id == UserVideoUnlock.video_id)
        .where(
            UserVideoUnlock.user_id == user.id,
            Video.is_published == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    rows = (
        (await db.execute(base.order_by(UserVideoUnlock.unlocked_at.desc()).offset(offset).limit(page_size + 1)))
        .tuples()
        .all()
    )
    has_more = len(rows) > page_size
    items = [VideoResponse.model_validate(video) for _, video in rows[:page_size]]
    return paginated(items, page=page, page_size=page_size, has_more=has_more, total=total)


async def list_unlocked_video_ids(db: AsyncSession, user: User) -> list[str]:
    """All video ids the user has unlocked (for card badges; grows ~quota/month)."""
    rows = await db.execute(select(UserVideoUnlock.video_id).where(UserVideoUnlock.user_id == user.id))
    return [r[0] for r in rows.all()]
