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
from datetime import date, timedelta

from sqlalchemy import case, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.preferences import UserPreferences
from app.services.local_time import get_user_local_date

logger = logging.getLogger(__name__)

# Valid semantic event types
EVENT_COMPLETED_VIDEO = "completed_video"
EVENT_LEARNED_WORDS = "learned_words"
EVENT_PRACTICED_ITEMS = "practiced_items"
EVENT_REVIEWED_WORDS = "reviewed_words"
EVENT_SHADOWED_SENTENCES = "shadowed_sentences"
EVENT_MET_DAILY_GOAL = "met_daily_goal"
# A02/MET-01: 当天第一次产生有效观看时长时发一条，用来把「只看了视频、没背词
# 也没看完」的用户放上学习日历。由 behavior_service 每天去重一次，不参与任何
# 每日计数器（_update_daily_progress 里没有它的列），只提供「这天学过」这个事实。
EVENT_WATCHED_VIDEO = "watched_video"

VALID_EVENT_TYPES = {
    EVENT_COMPLETED_VIDEO,
    EVENT_LEARNED_WORDS,
    EVENT_PRACTICED_ITEMS,
    EVENT_REVIEWED_WORDS,
    EVENT_WATCHED_VIDEO,
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
        # Savepoint: a mid-way failure must roll back this event's writes (row,
        # counters, streak, snapshot) without poisoning the caller's session —
        # the caller commits right after and would otherwise persist a partial
        # update or raise PendingRollbackError.
        async with db.begin_nested():
            # Determine user's local date for daily aggregation
            today = await get_user_local_date(db, user_id)

            # Insert event row
            event = LearningEvent(
                user_id=user_id,
                event_type=event_type,
                event_value=event_value,
                video_id=video_id,
                event_metadata=metadata,
                event_date=today,
            )
            db.add(event)

            # Update profile counters
            profile = await _get_or_create_profile(db, user_id)
            await _update_daily_progress(db, profile, event_type, event_value, today)
            await _update_streak(db, profile, today)

            # Check daily goal (only for learning events, not the meta-event).
            # Claiming the transition with a conditional UPDATE means two
            # concurrent events that cross the goal line emit exactly one
            # met_daily_goal row.
            if event_type != EVENT_MET_DAILY_GOAL:
                goal_met = await _check_daily_goal(db, profile)
                if goal_met and not profile.today_goal_met:
                    claimed = await db.execute(
                        update(UserLearningProfile)
                        .where(
                            UserLearningProfile.id == profile.id,
                            UserLearningProfile.today_goal_met.is_(False),
                        )
                        .values(today_goal_met=True)
                    )
                    if claimed.rowcount:
                        await db.refresh(profile)
                        # Emit meta-event (recursive but guarded by today_goal_met flag)
                        meta_event = LearningEvent(
                            user_id=user_id,
                            event_type=EVENT_MET_DAILY_GOAL,
                            event_value=1,
                            event_date=today,
                        )
                        db.add(meta_event)

            # Sprint 4: Write daily mastery snapshot (once per day)
            from app.services.milestone_service import ensure_today_snapshot

            await ensure_today_snapshot(db, user_id, today, profile.mastery_by_level)

    except Exception:
        logger.exception("Failed to emit learning event: %s for user %s", event_type, user_id)


async def _get_or_create_profile(db: AsyncSession, user_id: str) -> UserLearningProfile:
    """Get or create the user's learning profile.

    The implementation (and its first-access race handling) lives in
    ``profile_service``; this alias only keeps the call sites in this module
    reading as before.
    """
    from app.services.profile_service import get_or_create_profile

    return await get_or_create_profile(db, user_id)


# 「用户本地日」的唯一正文在 app.services.local_time（BUG-16 / DEC-079），本模块
# 只从那里导入 get_user_local_date：学习事件、每日计数与复习轮次共用同一个回退基准，
# 早先「这里回退 UTC、提醒任务回退东八」的分歧不再存在。


async def _update_daily_progress(
    db: AsyncSession,
    profile: UserLearningProfile,
    event_type: str,
    event_value: int,
    today: date,
) -> None:
    """Increment today's counters atomically.

    The previous implementation read the profile into Python and wrote
    ``profile.today_words_learned += value``; two concurrent events could both
    read the same old value and lose one increment. The counters are now
    updated with SQL ``col = col + :delta`` (row-locked by the DB), with the
    new-day reset done in the same conditional UPDATE so a racing reset cannot
    wipe an increment.
    """
    reset_condition = or_(
        UserLearningProfile.today_date.is_(None),
        UserLearningProfile.today_date != today,
    )
    await db.execute(
        update(UserLearningProfile)
        .where(UserLearningProfile.id == profile.id, reset_condition)
        .values(
            today_date=today,
            today_words_learned=0,
            today_minutes_spent=0,
            today_goal_met=False,
        )
    )

    if event_type in _WORDS_EVENTS:
        delta = event_value
        column = UserLearningProfile.today_words_learned
    elif event_type in _MINUTES_EVENTS:
        delta = _ESTIMATED_VIDEO_MINUTES * event_value
        column = UserLearningProfile.today_minutes_spent
    else:
        delta = 0
        column = None

    if column is not None and delta:
        await db.execute(
            update(UserLearningProfile).where(UserLearningProfile.id == profile.id).values({column.key: column + delta})
        )
    await db.refresh(profile)


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
    """Update the streak atomically.

    Each branch is a conditional UPDATE: only the transaction that still sees
    ``last_active_date`` in the expected state flips it to ``today``, so two
    concurrent events cannot both extend the streak for the same day.
    """
    yesterday = today - timedelta(days=1)
    first_activity = or_(
        UserLearningProfile.last_active_date.is_(None),
        UserLearningProfile.last_active_date < yesterday,
    )

    result = await db.execute(
        update(UserLearningProfile)
        .where(UserLearningProfile.id == profile.id, first_activity)
        .values(
            current_streak=1,
            last_active_date=today,
            longest_streak=case(
                (UserLearningProfile.longest_streak < 1, 1),
                else_=UserLearningProfile.longest_streak,
            ),
        )
    )
    if result.rowcount == 0:
        extended = UserLearningProfile.current_streak + 1
        await db.execute(
            update(UserLearningProfile)
            .where(
                UserLearningProfile.id == profile.id,
                UserLearningProfile.last_active_date == yesterday,
            )
            .values(
                current_streak=extended,
                last_active_date=today,
                longest_streak=case(
                    (UserLearningProfile.longest_streak < extended, extended),
                    else_=UserLearningProfile.longest_streak,
                ),
            )
        )
    await db.refresh(profile)


async def get_weekly_cycle_count(db: AsyncSession, user_id: str) -> dict:
    """Count complete learning cycles this week.

    A cycle = at least one of each: completed_video, learned_words,
    practiced_items, reviewed_words within the same day.
    Count distinct days with all 4 event types.

    Returns {"cycles_completed": N, "week_start": date, "days_active": N}
    """
    today = await get_user_local_date(db, user_id)
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
    today = await get_user_local_date(db, user_id)

    # Reset if new day (in case no events were emitted today yet). Conditional
    # UPDATE rather than Python assignment: the read path must not wipe a
    # concurrent event's increment with a stale profile object.
    if profile.today_date != today:
        await db.execute(
            update(UserLearningProfile)
            .where(
                UserLearningProfile.id == profile.id,
                or_(
                    UserLearningProfile.today_date.is_(None),
                    UserLearningProfile.today_date != today,
                ),
            )
            .values(
                today_date=today,
                today_words_learned=0,
                today_minutes_spent=0,
                today_goal_met=False,
            )
        )
        await db.refresh(profile)

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
