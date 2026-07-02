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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_activity import DailyActivity
from app.models.preferences import UserPreferences
from app.models.user import User

logger = structlog.get_logger()


async def get_or_create_daily_activity(db: AsyncSession, user_id: str, target_date: date) -> DailyActivity:
    """Get the DailyActivity row for a user+date, creating one if missing.

    Race-safe: if two concurrent requests both see no existing row and
    both try to INSERT, the ``uq_daily_activity_user_date`` constraint
    rejects the duplicate.  We catch the IntegrityError inside a
    savepoint (nested transaction) so the outer transaction is preserved,
    then re-fetch the row that the winner created — so the caller's
    counter updates are never lost.
    """
    result = await db.execute(
        select(DailyActivity).where(
            DailyActivity.user_id == user_id,
            DailyActivity.date == target_date,
        )
    )
    activity = result.scalar_one_or_none()
    if activity:
        return activity

    # Use a savepoint so a failed INSERT doesn't roll back the outer
    # transaction (which may contain unflushed work from the caller,
    # e.g. a SpeakingAttempt row in speaking_service).
    async with db.begin_nested():
        activity = DailyActivity(user_id=user_id, date=target_date)
        db.add(activity)
        try:
            await db.flush()
        except IntegrityError:
            # Concurrent insert won — the savepoint rolls back automatically.
            # Re-fetch the row that the other request created.
            result = await db.execute(
                select(DailyActivity).where(
                    DailyActivity.user_id == user_id,
                    DailyActivity.date == target_date,
                )
            )
            activity = result.scalar_one_or_none()
            if activity is None:
                # Should never happen, but don't crash
                raise
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

    # Batch-fetch all DailyActivity rows for the past year and scan in memory
    # instead of one query per day (fixes N+1 — was up to 365 queries).
    start_date = check_date - timedelta(days=365)
    past_result = await db.execute(
        select(DailyActivity.date, DailyActivity.goal_met).where(
            DailyActivity.user_id == user_id,
            DailyActivity.date >= start_date,
            DailyActivity.date <= check_date,
        )
    )
    met_dates = {row.date for row in past_result if row.goal_met}

    for _ in range(365):  # safety limit
        if check_date in met_dates:
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


async def get_user_stats(db: AsyncSession, user_id: str, period: str = "all") -> dict:
    """Aggregate learning stats for a given time period.

    Relocated from ``speaking_service`` when AI speaking scoring was removed
    (ADR-0002, 2026-07). Still returns speaking metrics (accuracy/fluency/
    completeness) sourced from the **frozen** ``SpeakingAttempt`` table and
    ``DailyActivity`` snapshots — no new speaking data is written, so these
    numbers are historical only. Slated for rebuild in ADR-0003 (Phase 4) to
    surface vocab/watch metrics instead of speaking.

    Args:
        period: "today" | "week" | "month" | "all"

    Returns:
        Dict with aggregate stats and optional trend data.
    """
    from app.models.learning import LearningRecord, SpeakingAttempt, Vocabulary

    # Determine date range
    now = datetime.now(UTC)
    today = now.date()

    if period == "today":
        start_date = today
    elif period == "week":
        start_date = today - timedelta(days=6)  # 7 days including today
    elif period == "month":
        start_date = today - timedelta(days=29)  # 30 days including today
    else:
        start_date = None  # all time

    # ── Aggregate from DailyActivity (fast, pre-computed) ──
    if start_date is not None:
        # Time-bounded query using daily_activities
        da_stmt = select(DailyActivity).where(
            DailyActivity.user_id == user_id,
            DailyActivity.date >= start_date,
        )
    else:
        da_stmt = select(DailyActivity).where(DailyActivity.user_id == user_id)

    da_result = await db.execute(da_stmt.order_by(DailyActivity.date))
    daily_activities = da_result.scalars().all()

    total_speaking = sum(d.speaking_attempts for d in daily_activities)
    total_vocab = 0  # Will query separately
    total_videos = sum(1 for d in daily_activities if d.speaking_attempts > 0 or d.videos_watched > 0)

    # Weighted averages from daily activities
    if total_speaking > 0:
        weighted_acc = sum(
            (d.avg_accuracy or 0) * d.speaking_attempts for d in daily_activities if d.speaking_attempts > 0
        )
        weighted_flu = sum(
            (d.avg_fluency or 0) * d.speaking_attempts for d in daily_activities if d.speaking_attempts > 0
        )
        weighted_comp = sum(
            (d.avg_completeness or 0) * d.speaking_attempts for d in daily_activities if d.speaking_attempts > 0
        )
        avg_accuracy = round(weighted_acc / total_speaking, 1)
        avg_fluency = round(weighted_flu / total_speaking, 1)
        avg_completeness = round(weighted_comp / total_speaking, 1)
    else:
        # Fallback: query SpeakingAttempt directly (for "all" period or sparse data)
        acc_result = await db.execute(
            select(func.avg(SpeakingAttempt.accuracy)).where(
                SpeakingAttempt.user_id == user_id,
                SpeakingAttempt.accuracy.isnot(None),
            )
        )
        flu_result = await db.execute(
            select(func.avg(SpeakingAttempt.fluency)).where(
                SpeakingAttempt.user_id == user_id,
                SpeakingAttempt.fluency.isnot(None),
            )
        )
        comp_result = await db.execute(
            select(func.avg(SpeakingAttempt.completeness)).where(
                SpeakingAttempt.user_id == user_id,
                SpeakingAttempt.completeness.isnot(None),
            )
        )
        avg_accuracy = round(float(acc_result.scalar() or 0), 1)
        avg_fluency = round(float(flu_result.scalar() or 0), 1)
        avg_completeness = round(float(comp_result.scalar() or 0), 1)

    # Vocabulary count (separate query — not in DailyActivity aggregates)
    vocab_result = await db.execute(select(func.count(Vocabulary.id)).where(Vocabulary.user_id == user_id))
    total_vocab = vocab_result.scalar() or 0

    # Videos watched count
    videos_result = await db.execute(select(func.count(LearningRecord.id)).where(LearningRecord.user_id == user_id))
    total_videos = videos_result.scalar() or 0

    # ── Build trend data ──
    trend = None
    if period in ("week", "month") and daily_activities:
        trend = {
            "accuracy": [round(d.avg_accuracy or 0, 1) for d in daily_activities],
            "fluency": [round(d.avg_fluency or 0, 1) for d in daily_activities],
            "completeness": [round(d.avg_completeness or 0, 1) for d in daily_activities],
            "dates": [d.date.isoformat() for d in daily_activities],
        }

    return {
        "total_speaking_attempts": total_speaking,
        "average_accuracy": avg_accuracy,
        "average_fluency": avg_fluency,
        "average_completeness": avg_completeness,
        "total_vocabulary": total_vocab,
        "total_videos_watched": total_videos,
        "period": period,
        "trend": trend,
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
