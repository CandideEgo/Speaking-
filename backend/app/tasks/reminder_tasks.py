"""Celery beat tasks for study reminders (产品设计规划-2026-08 §4-D6).

Three reminder families, all delivered as in-app notifications via
``notification_service.create_notification`` (WebSocket push included):

- ``send_hourly_reminders``: hourly sweep. Sends the vocabulary-review
  reminder when the user's local clock hits their ``vocabulary_reminder_time``
  hour and they have due words; sends the streak-at-risk warning at local
  21:00 when the streak is ≥2 and today has no learning activity yet.
- ``send_pro_expiring_reminders``: daily sweep for Pro (incl. trial) that
  expires in 3 / 1 days.

Timezone handling mirrors ``stats_weekly`` / ``learning_event_service``:
the user's ``reminder_timezone`` preference (default ``Asia/Shanghai``)
converts the sweep instant into local wall-clock time.

Deduplication: a per-user per-day Redis key (``SET NX EX 86400``) blocks
re-sends within the same local day. Redis outage is fail-open — the send
proceeds and ``create_notification``'s unread-dedup (same user/type/url)
is the fallback. Task bodies accept an optional aware-UTC ``now`` as a
test seam; beat always invokes them with no arguments.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import structlog

from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()

_DEFAULT_TZ = "Asia/Shanghai"
_STREAK_WARNING_HOUR = 21
_STREAK_MIN = 2


def _to_local(now_utc: datetime, tz_name: str | None) -> datetime:
    """Convert aware UTC to the user's local wall-clock time."""
    if tz_name:
        try:
            return now_utc.astimezone(ZoneInfo(tz_name))
        except Exception:
            pass
    return now_utc.astimezone(ZoneInfo(_DEFAULT_TZ))


def _merged_prefs(prefs) -> dict:
    """Merge stored notification_preferences over the defaults (same rule
    as GET /notifications/preferences)."""
    from app.models.preferences import DEFAULT_NOTIFICATION_PREFS

    merged = DEFAULT_NOTIFICATION_PREFS.copy()
    if prefs is not None and isinstance(prefs.notification_preferences, dict):
        merged.update(prefs.notification_preferences)
    return merged


async def _claim_daily_slot(key: str) -> bool:
    """SET NX one-per-day guard. Fail-open: any Redis error lets the send
    proceed (create_notification's unread-dedup is the fallback)."""
    try:
        from app.core.redis import get_redis

        ok = await get_redis().set(key, "1", nx=True, ex=86400)
        return bool(ok)
    except Exception:
        logger.warning("reminder_redis_fail_open", key=key)
        return True


async def _count_due_words(db, user_id: str, now_utc: datetime) -> int:
    from sqlalchemy import func, select

    from app.models.learning import Vocabulary

    result = await db.execute(
        select(func.count(Vocabulary.id)).where(
            Vocabulary.user_id == user_id,
            (Vocabulary.next_review_at.is_(None)) | (Vocabulary.next_review_at <= now_utc),
        )
    )
    return result.scalar() or 0


@celery_app.task
def send_hourly_reminders(now: datetime | None = None):
    """Hourly sweep: vocabulary-review reminder + streak-at-risk warning.

    Runs on a Celery beat schedule (crontab minute=0). Each user is matched
    against their own local time so a single sweep covers all timezones.
    """
    from app.core.database import async_session

    async def _process():
        from sqlalchemy import select

        from app.models.learning_plan import UserLearningProfile
        from app.models.preferences import UserPreferences
        from app.models.user import User
        from app.services.notification_service import create_notification

        now_utc = now or datetime.now(UTC)
        sent = {"vocabulary_reminder": 0, "streak_warning": 0}

        async with async_session() as db:
            rows = (
                await db.execute(
                    select(User, UserPreferences).outerjoin(UserPreferences, UserPreferences.user_id == User.id)
                )
            ).all()
            profiles = {p.user_id: p for p in (await db.execute(select(UserLearningProfile))).scalars()}

            for user, prefs in rows:
                nprefs = _merged_prefs(prefs)
                local_now = _to_local(now_utc, prefs.reminder_timezone if prefs else None)

                # ── Vocabulary review reminder (user's chosen hour) ──
                if nprefs.get("vocabulary_reminder", True):
                    reminder_time = nprefs.get("vocabulary_reminder_time") or "20:00"
                    try:
                        reminder_hour = int(str(reminder_time).split(":")[0])
                    except ValueError:
                        reminder_hour = 20
                    if local_now.hour == reminder_hour:
                        due = await _count_due_words(db, user.id, now_utc)
                        if due > 0:
                            key = f"reminder:vocabulary_reminder:{user.id}:{local_now.date().isoformat()}"
                            if await _claim_daily_slot(key):
                                await create_notification(
                                    user_id=user.id,
                                    type="vocabulary_reminder",
                                    title="词汇复习提醒",
                                    message=f"你有 {due} 个单词待复习，2 分钟搞定",
                                    db=db,
                                    related_url="/vocabulary",
                                )
                                sent["vocabulary_reminder"] += 1

                # ── Streak-at-risk warning (local 21:00) ──
                if local_now.hour == _STREAK_WARNING_HOUR and nprefs.get("streak_warning_enabled", True):
                    profile = profiles.get(user.id)
                    if (
                        profile is not None
                        and profile.current_streak >= _STREAK_MIN
                        and (profile.last_active_date is None or profile.last_active_date < local_now.date())
                    ):
                        key = f"reminder:streak_warning:{user.id}:{local_now.date().isoformat()}"
                        if await _claim_daily_slot(key):
                            await create_notification(
                                user_id=user.id,
                                type="streak_warning",
                                title="连续学习提醒",
                                message=f"已连续学习 {profile.current_streak} 天，今天还没有学习记录，别让记录中断",
                                db=db,
                                related_url="/",
                            )
                            sent["streak_warning"] += 1

            if sent["vocabulary_reminder"] or sent["streak_warning"]:
                await db.commit()
            logger.info("hourly_reminders_sent", **sent)
            return sent

    try:
        return run_async(_process())
    except Exception:
        logger.exception("send_hourly_reminders failed")
        return {"vocabulary_reminder": 0, "streak_warning": 0}


@celery_app.task
def send_pro_expiring_reminders(now: datetime | None = None):
    """Daily sweep: warn Pro users (incl. trial) 3 days and 1 day before expiry.

    Runs on a Celery beat schedule (crontab minute=0, hour=1 UTC = 09:00
    Beijing). Dedup key includes the days-left bucket so the 3-day and 1-day
    notices are distinct even if sweeps overlap.
    """
    from app.core.database import async_session

    async def _process():
        from sqlalchemy import select

        from app.models.preferences import UserPreferences
        from app.models.user import PlanType, User
        from app.services.notification_service import create_notification

        now_utc = now or datetime.now(UTC)
        sent = 0

        async with async_session() as db:
            rows = (
                await db.execute(
                    select(User, UserPreferences)
                    .outerjoin(UserPreferences, UserPreferences.user_id == User.id)
                    .where(User.plan == PlanType.pro, User.plan_expires_at.is_not(None))
                )
            ).all()

            for user, prefs in rows:
                nprefs = _merged_prefs(prefs)
                if not nprefs.get("pro_expiring", True):
                    continue

                local_now = _to_local(now_utc, prefs.reminder_timezone if prefs else None)
                expires = user.plan_expires_at
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=UTC)
                days_left = (expires.astimezone(local_now.tzinfo).date() - local_now.date()).days
                if days_left not in (1, 3):
                    continue

                message = (
                    "您的 Pro 会员明天到期，续费后继续无限观看所有视频"
                    if days_left == 1
                    else f"您的 Pro 会员将于 {days_left} 天后到期，续费后继续无限观看所有视频"
                )
                key = f"reminder:pro_expiring:{user.id}:{local_now.date().isoformat()}:{days_left}"
                if await _claim_daily_slot(key):
                    await create_notification(
                        user_id=user.id,
                        type="pro_expiring",
                        title="Pro 会员即将到期",
                        message=message,
                        db=db,
                        related_url="/upgrade",
                    )
                    sent += 1

            if sent:
                await db.commit()
            logger.info("pro_expiring_reminders_sent", count=sent)
            return sent

    try:
        return run_async(_process())
    except Exception:
        logger.exception("send_pro_expiring_reminders failed")
        return 0
