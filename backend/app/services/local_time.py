"""用户本地日 / 本地时刻的单一权威（BUG-16，DEC-079）。

同一座仓此前有三套「今天」：``learning_event_service`` 与 ``vocabulary_service``
在用户没设 ``reminder_timezone`` 时回退 **UTC**，而 ``reminder_tasks`` 回退
**Asia/Shanghai**。断链判定（提醒）与每日计数/连续天数（学习事件）因此可能对
「今天」给出不同答案——北京时间 00:00–08:00 之间两者整整差一天。

这里把它收敛成一个助手加一个默认时区常量：凡是要「用户本地日」或「用户本地时刻」
的地方都从这里取，时区来源仍然是 ``UserPreferences.reminder_timezone``。
"""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.preferences import UserPreferences

# 没有偏好（或偏好值非法）时的回退基准。选东八区而不是 UTC：站内面向中文用户，
# 榜单周窗（周一 00:00 Asia/Shanghai）、提醒任务与用户感知的「今天」都已经是这个口径。
DEFAULT_USER_TIMEZONE = "Asia/Shanghai"


def resolve_user_timezone(tz_name: str | None) -> ZoneInfo:
    """用户的时区；未设置或名字非法时回退到 ``DEFAULT_USER_TIMEZONE``。"""
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    return ZoneInfo(DEFAULT_USER_TIMEZONE)


def user_local_now(tz_name: str | None, *, now: datetime | None = None) -> datetime:
    """用户墙钟时刻（带时区）。``now`` 须是 aware UTC，默认取当前时刻。"""
    return (now or datetime.now(UTC)).astimezone(resolve_user_timezone(tz_name))


def user_local_date(tz_name: str | None, *, now: datetime | None = None) -> date:
    """用户本地的日历日期。"""
    return user_local_now(tz_name, now=now).date()


async def get_user_local_now(db: AsyncSession, user_id: str) -> datetime:
    """读偏好并算出该用户的本地时刻。"""
    result = await db.execute(select(UserPreferences.reminder_timezone).where(UserPreferences.user_id == user_id))
    return user_local_now(result.scalar_one_or_none())


async def get_user_local_date(db: AsyncSession, user_id: str) -> date:
    """读偏好并算出该用户的本地日期。"""
    return (await get_user_local_now(db, user_id)).date()
