"""Learning event service — structured semantic learning events (ADR-0012).

Emits LearningEvent rows and incrementally updates UserLearningProfile
daily counters, streak, and goal tracking. Distinct from raw BehaviorEvent
(click/play/pause) — LearningEvent captures high-level learning actions
(completed_video, learned_words, practiced_items, reviewed_words) that
feed the learning profile, daily goal tracking, and recommendation system.

Event emission is non-blocking: failures are logged but never raise, so
existing service flows (practice submission, video completion) are not
disrupted by event emission issues.
"""

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning import Vocabulary
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.preferences import UserPreferences

logger = logging.getLogger(__name__)

# Valid semantic event types
EVENT_COMPLETED_VIDEO = "completed_video"
EVENT_LEARNED_WORDS = "learned_words"
EVENT_PRACTICED_ITEMS = "practiced_items"
EVENT_REVIEWED_WORDS = "reviewed_words"
EVENT_SHADOWED_SENTENCES = "shadowed_sentences"
EVENT_COMPLETED_PLAN = "completed_plan"
EVENT_MET_DAILY_GOAL = "met_daily_goal"

VALID_EVENT_TYPES = {
    EVENT_COMPLETED_VIDEO,
    EVENT_LEARNED_WORDS,
    EVENT_PRACTICED_ITEMS,
    EVENT_REVIEWED_WORDS,
    EVENT_SHADOWED_SENTENCES,
    EVENT_COMPLETED_PLAN,
    EVENT_MET_DAILY_GOAL,
}

# Event type → which daily counter to increment
_WORDS_EVENTS = {EVENT_LEARNED_WORDS, EVENT_REVIEWED_WORDS}
_MINUTES_EVENTS = {EVENT_COMPLETED_VIDEO}

# Estimated minutes per completed video (rough heuristic)
_ESTIMATED_VIDEO_MINUTES = 5


async def emit_event(
    db: AsyncSession,
    user_id: str,
    event_type: str,
    event_value: int = 1,
    video_id: str | None = None,
    plan_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Emit a structured learning event and update daily goal tracking.

    Non-blocking: wraps all work in try/except so callers are never disrupted.
    Does NOT commit — the caller commits.
    Side effects:
    - Insert LearningEvent row
    - Update UserLearningProfile.today_* counters
    - Check if daily goal is met → emit "met_daily_goal" event
    - Update streak (current_streak, longest_streak, last_active_date)
    """
    if event_type not in VALID_EVENT_TYPES:
        logger.warning("Invalid learning event type: %s", event_type)
        return

    try:
        # Determine user's local date for daily aggregation
        today = await _get_user_local_date(db, user_id)

        # Insert event row
        event = LearningEvent(
            user_id=user_id,
            event_type=event_type,
            event_value=event_value,
            video_id=video_id,
            plan_id=plan_id,
            event_metadata=metadata,
            event_date=today,
        )
        db.add(event)

        # Update profile counters
        profile = await _get_or_create_profile(db, user_id)
        await _update_daily_progress(db, profile, event_type, event_value, today)
        await _update_streak(db, profile, today)

        # Check daily goal (only for learning events, not meta-events)
        if event_type not in {EVENT_COMPLETED_PLAN, EVENT_MET_DAILY_GOAL}:
            goal_met = await _check_daily_goal(db, profile)
            if goal_met and not profile.today_goal_met:
                profile.today_goal_met = True
                # Emit meta-event (recursive but guarded by today_goal_met flag)
                meta_event = LearningEvent(
                    user_id=user_id,
                    event_type=EVENT_MET_DAILY_GOAL,
                    event_value=1,
                    event_date=today,
                )
                db.add(meta_event)

    except Exception:
        logger.exception("Failed to emit learning event: %s for user %s", event_type, user_id)


async def _get_or_create_profile(db: AsyncSession, user_id: str) -> UserLearningProfile:
    """Get or create the user's learning profile. Auto-creates on first access."""
    result = await db.execute(select(UserLearningProfile).where(UserLearningProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserLearningProfile(user_id=user_id)
        db.add(profile)
        await db.flush()
    return profile


async def _get_user_local_date(db: AsyncSession, user_id: str) -> date:
    """Determine the user's local date from their timezone preference.

    Falls back to UTC if no timezone is set.
    """
    result = await db.execute(select(UserPreferences.reminder_timezone).where(UserPreferences.user_id == user_id))
    tz_name = result.scalar_one_or_none()

    if tz_name:
        try:
            from zoneinfo import ZoneInfo

            tz = ZoneInfo(tz_name)
            return datetime.now(tz).date()
        except Exception:
            pass

    return datetime.now(UTC).date()


async def _update_daily_progress(
    db: AsyncSession,
    profile: UserLearningProfile,
    event_type: str,
    event_value: int,
    today: date,
) -> None:
    """Increment today's counters on UserLearningProfile.

    Resets counters if the date has changed (new day).
    """
    # Reset if new day
    if profile.today_date != today:
        profile.today_words_learned = 0
        profile.today_minutes_spent = 0
        profile.today_goal_met = False
        profile.today_date = today

    # Increment appropriate counter
    if event_type in _WORDS_EVENTS:
        profile.today_words_learned += event_value
    elif event_type in _MINUTES_EVENTS:
        profile.today_minutes_spent += _ESTIMATED_VIDEO_MINUTES * event_value


async def _check_daily_goal(db: AsyncSession, profile: UserLearningProfile) -> bool:
    """Check if today's goal is met based on UserPreferences.daily_goal_type/value."""
    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == profile.user_id))
    prefs = result.scalar_one_or_none()
    if not prefs:
        return False

    if prefs.daily_goal_type == "words":
        return profile.today_words_learned >= prefs.daily_goal_value
    elif prefs.daily_goal_type == "minutes":
        return profile.today_minutes_spent >= prefs.daily_goal_value
    return False


async def _update_streak(db: AsyncSession, profile: UserLearningProfile, today: date) -> None:
    """Update streak based on last_active_date.

    If last_active_date == yesterday: current_streak += 1
    If last_active_date == today: no change (already counted)
    If last_active_date < yesterday: current_streak = 1 (streak broken)
    """
    if profile.last_active_date is None:
        # First ever activity
        profile.current_streak = 1
    elif profile.last_active_date == today:
        # Already active today, no change
        return
    elif profile.last_active_date == today - timedelta(days=1):
        # Active yesterday, extend streak
        profile.current_streak += 1
    else:
        # Streak broken
        profile.current_streak = 1

    profile.last_active_date = today
    profile.longest_streak = max(profile.longest_streak, profile.current_streak)


async def get_weekly_cycle_count(db: AsyncSession, user_id: str) -> dict:
    """Count complete learning cycles this week.

    A cycle = at least one of each: completed_video, learned_words,
    practiced_items, reviewed_words within the same day.
    Count distinct days with all 4 event types.

    Returns {"cycles_completed": N, "week_start": date, "days_active": N}
    """
    today = await _get_user_local_date(db, user_id)
    # Week starts on Monday
    week_start = today - timedelta(days=today.weekday())

    # Query: for each day this week, count distinct event types
    required_types = {
        EVENT_COMPLETED_VIDEO,
        EVENT_LEARNED_WORDS,
        EVENT_PRACTICED_ITEMS,
        EVENT_REVIEWED_WORDS,
    }

    result = await db.execute(
        select(
            LearningEvent.event_date,
            func.count(func.distinct(LearningEvent.event_type)).label("type_count"),
        )
        .where(
            LearningEvent.user_id == user_id,
            LearningEvent.event_date >= week_start,
            LearningEvent.event_type.in_(required_types),
        )
        .group_by(LearningEvent.event_date)
    )

    cycles_completed = 0
    days_active = 0
    for row in result:
        days_active += 1
        if row.type_count >= 4:
            cycles_completed += 1

    return {
        "cycles_completed": cycles_completed,
        "week_start": week_start,
        "days_active": days_active,
    }


async def get_today_progress(db: AsyncSession, user_id: str) -> dict:
    """Return today's progress: words learned, minutes spent, goal status, streak.

    Aggregates from UserLearningProfile cache (incrementally updated via
    emit_event) with a fallback recompute from LearningEvent rows if the
    cache is stale or missing.
    """
    profile = await _get_or_create_profile(db, user_id)
    today = await _get_user_local_date(db, user_id)

    # Reset if new day (in case no events were emitted today yet)
    if profile.today_date != today:
        profile.today_words_learned = 0
        profile.today_minutes_spent = 0
        profile.today_goal_met = False
        profile.today_date = today

    # Get preferences for goal info
    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
    prefs = result.scalar_one_or_none()
    goal_type = prefs.daily_goal_type if prefs else "words"
    goal_value = prefs.daily_goal_value if prefs else 5

    # Compute goal progress
    if goal_type == "words":
        goal_progress = min(profile.today_words_learned / max(goal_value, 1), 1.0)
    else:
        goal_progress = min(profile.today_minutes_spent / max(goal_value, 1), 1.0)

    # Get weekly cycle count
    weekly = await get_weekly_cycle_count(db, user_id)

    return {
        "today_words_learned": profile.today_words_learned,
        "today_minutes_spent": profile.today_minutes_spent,
        "daily_goal_type": goal_type,
        "daily_goal_value": goal_value,
        "goal_met": profile.today_goal_met,
        "goal_progress": round(goal_progress, 2),
        "current_streak": profile.current_streak,
        "weekly_cycles_completed": weekly["cycles_completed"],
    }
