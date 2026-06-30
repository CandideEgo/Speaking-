"""Activity tracking service — records daily learning activity and manages streaks.

Every learning event (speaking practice, vocabulary review, video watch, quiz)
flows through this service to update the DailyActivity snapshot for the current
day and recompute the user's streak.

Design:
  - One DailyActivity row per user per day (upsert via get_or_create).
  - goal_met is pre-computed so streak logic is a simple backward scan.
  - Streak is stored on User.streak_count for O(1) reads.
  - If the user has no daily_goal set, streak is not tracked.
"""

from datetime import UTC, date, datetime, timedelta

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_activity import DailyActivity
from app.models.preferences import UserPreferences
from app.models.user import User

logger = structlog.get_logger()


async def get_or_create_daily_activity(db: AsyncSession, user_id: str, target_date: date) -> DailyActivity:
    """Get the DailyActivity row for a user+date, creating one if missing."""
    result = await db.execute(
        select(DailyActivity).where(
            DailyActivity.user_id == user_id,
            DailyActivity.date == target_date,
        )
    )
    activity = result.scalar_one_or_none()
    if activity:
        return activity

    activity = DailyActivity(user_id=user_id, date=target_date)
    db.add(activity)
    await db.flush()
    return activity


async def record_speaking_activity(
    db: AsyncSession,
    user_id: str,
    accuracy: float | None,
    fluency: float | None,
    completeness: float | None,
) -> None:
    """Record a speaking attempt in today's daily activity."""
    today = _today()
    activity = await get_or_create_daily_activity(db, user_id, today)

    activity.speaking_attempts += 1

    # Recompute averages including this attempt.
    # Only incorporate non-None values so that free-speaking (which
    # lacks accuracy/completeness) doesn't bias the running average
    # by inflating the denominator without contributing data.
    count = activity.speaking_attempts
    if accuracy is not None:
        activity.avg_accuracy = _update_avg(activity.avg_accuracy, accuracy, count)
    if fluency is not None:
        activity.avg_fluency = _update_avg(activity.avg_fluency, fluency, count)
    if completeness is not None:
        activity.avg_completeness = _update_avg(activity.avg_completeness, completeness, count)

    await _check_goal_met(db, user_id, activity)
    await db.flush()


async def record_vocabulary_activity(db: AsyncSession, user_id: str, activity_type: str) -> None:
    """Record a vocabulary add or review in today's daily activity."""
    today = _today()
    activity = await get_or_create_daily_activity(db, user_id, today)

    if activity_type == "added":
        activity.words_added += 1
    elif activity_type == "reviewed":
        activity.words_reviewed += 1

    await _check_goal_met(db, user_id, activity)
    await db.flush()


async def record_video_activity(db: AsyncSession, user_id: str) -> None:
    """Record a video watch in today's daily activity."""
    today = _today()
    activity = await get_or_create_daily_activity(db, user_id, today)
    activity.videos_watched += 1

    await _check_goal_met(db, user_id, activity)
    await db.flush()


async def record_quiz_activity(db: AsyncSession, user_id: str) -> None:
    """Record a quiz submission in today's daily activity."""
    today = _today()
    activity = await get_or_create_daily_activity(db, user_id, today)
    activity.quizzes_taken += 1

    await _check_goal_met(db, user_id, activity)
    await db.flush()


async def update_streak(db: AsyncSession, user_id: str) -> int:
    """Recompute and persist the user's streak.

    Streak logic:
      - If user has no daily_goal_type set, streak is not tracked (returns 0).
      - A day counts toward the streak only if goal_met=True on that day.
      - Streak = number of consecutive days (ending yesterday or today) with goal_met.
      - If today is not goal_met yet, the streak is the number of consecutive
        days ending yesterday (the current streak can extend if today becomes goal_met).

    Returns the current streak count.
    """
    # Check if user has a goal set
    prefs_result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
    prefs = prefs_result.scalar_one_or_none()
    if not prefs or not prefs.daily_goal_type:
        # No goal set — don't track streak
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.streak_count = 0
        return 0

    # Scan backward from today to count consecutive goal_met days
    streak = 0
    check_date = _today()

    # Check today first
    today_activity = await db.execute(
        select(DailyActivity).where(
            DailyActivity.user_id == user_id,
            DailyActivity.date == check_date,
        )
    )
    today = today_activity.scalar_one_or_none()

    if today and today.goal_met:
        # Today is met — count it and continue backward
        streak = 1
        check_date -= timedelta(days=1)
    else:
        # Today not met yet — start counting from yesterday
        check_date -= timedelta(days=1)

    # Continue backward counting consecutive goal_met days
    for _ in range(365):  # safety limit
        day_result = await db.execute(
            select(DailyActivity).where(
                DailyActivity.user_id == user_id,
                DailyActivity.date == check_date,
            )
        )
        day_activity = day_result.scalar_one_or_none()

        if day_activity and day_activity.goal_met:
            streak += 1
            check_date -= timedelta(days=1)
        else:
            break

    # Update user
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user:
        user.streak_count = streak
        if streak > user.longest_streak:
            user.longest_streak = streak

    await db.flush()
    return streak


async def get_activity_calendar(db: AsyncSession, user_id: str, year: int, month: int) -> list[dict]:
    """Return activity data for each day of the given month."""
    start = date(year, month, 1)
    # Calculate end of month
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)

    result = await db.execute(
        select(DailyActivity)
        .where(
            DailyActivity.user_id == user_id,
            DailyActivity.date >= start,
            DailyActivity.date <= end,
        )
        .order_by(DailyActivity.date)
    )
    activities = result.scalars().all()

    return [
        {
            "date": a.date.isoformat(),
            "speaking_attempts": a.speaking_attempts,
            "words_reviewed": a.words_reviewed,
            "words_added": a.words_added,
            "videos_watched": a.videos_watched,
            "quizzes_taken": a.quizzes_taken,
            "avg_accuracy": a.avg_accuracy,
            "avg_fluency": a.avg_fluency,
            "avg_completeness": a.avg_completeness,
            "time_spent_seconds": a.time_spent_seconds,
            "goal_met": a.goal_met,
        }
        for a in activities
    ]


async def get_streak_info(db: AsyncSession, user_id: str) -> dict:
    """Return streak info and today's progress."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    prefs_result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
    prefs = prefs_result.scalar_one_or_none()

    # Today's progress
    today = _today()
    today_result = await db.execute(
        select(DailyActivity).where(
            DailyActivity.user_id == user_id,
            DailyActivity.date == today,
        )
    )
    today_activity = today_result.scalar_one_or_none()

    goal_type = prefs.daily_goal_type if prefs else None
    goal_value = prefs.daily_goal_value if prefs else 0

    today_progress = {
        "speaking_attempts": today_activity.speaking_attempts if today_activity else 0,
        "words_reviewed": today_activity.words_reviewed if today_activity else 0,
        "words_added": today_activity.words_added if today_activity else 0,
        "videos_watched": today_activity.videos_watched if today_activity else 0,
        "quizzes_taken": today_activity.quizzes_taken if today_activity else 0,
        "time_spent_seconds": today_activity.time_spent_seconds if today_activity else 0,
        "goal_met": today_activity.goal_met if today_activity else False,
    }

    return {
        "current_streak": user.streak_count if user else 0,
        "longest_streak": user.longest_streak if user else 0,
        "last_active_at": user.last_active_at.isoformat() if user and user.last_active_at else None,
        "goal_type": goal_type,
        "goal_value": goal_value,
        "today_progress": today_progress,
    }


# ── Internal helpers ─────────────────────────────────────────────────


async def _check_goal_met(db: AsyncSession, user_id: str, activity: DailyActivity) -> None:
    """Check if the user's daily goal is now met and update goal_met."""
    prefs_result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
    prefs = prefs_result.scalar_one_or_none()

    if not prefs or not prefs.daily_goal_type:
        activity.goal_met = False
        return

    goal_type = prefs.daily_goal_type
    goal_value = prefs.daily_goal_value

    if goal_type == "speaking_attempts":
        activity.goal_met = activity.speaking_attempts >= goal_value
    elif goal_type == "words":
        activity.goal_met = (activity.words_reviewed + activity.words_added) >= goal_value
    elif goal_type == "minutes":
        activity.goal_met = (activity.time_spent_seconds / 60) >= goal_value
    else:
        activity.goal_met = False


def _update_avg(current_avg: float | None, new_value: float | None, count: int) -> float | None:
    """Incrementally update an average with a new value."""
    if new_value is None:
        return current_avg
    if current_avg is None:
        return round(new_value, 1)
    # Running average: new_avg = old_avg + (new_value - old_avg) / count
    return round(current_avg + (new_value - current_avg) / count, 1)


def _today() -> date:
    """Return today's date in UTC."""
    return datetime.now(UTC).date()
