"""Profile service — user learning profile aggregation (ADR-0012).

Computes and caches the UserLearningProfile from raw data (Vocabulary,
LearningEvent). The profile contains estimated CEFR level, per-exam-level
mastery breakdown, strengths/weaknesses, and weekly cycle counts.

Profile is incrementally updated via learning_event_service.emit_event()
for daily counters and streak. This service handles the heavier
recomputations (mastery_by_level, estimated_level) that run on-demand
via POST /plan/profile/refresh.
"""

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exam_levels import EXAM_LEVELS, level_order
from app.models.learning import Vocabulary
from app.models.learning_plan import LearningEvent, UserLearningProfile

logger = logging.getLogger(__name__)

# Exam level → CEFR level mapping (for estimated_level derivation)
_EXAM_CEFR = {
    "zhongkao": "A1",
    "gaoKao": "A2",
    "cet4": "B1",
    "cet6": "B2",
    "ky": "B2",
    "ielts": "C1",
    "toefl": "C1",
    "gre": "C2",
}

# CEFR ordering for comparison
_CEFR_ORDER = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}


async def get_or_create_profile(db: AsyncSession, user_id: str) -> UserLearningProfile:
    """Get or create the user's learning profile. Auto-creates on first access."""
    result = await db.execute(select(UserLearningProfile).where(UserLearningProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserLearningProfile(user_id=user_id)
        db.add(profile)
        await db.flush()
    return profile


async def refresh_profile(db: AsyncSession, user_id: str) -> dict:
    """Recompute the profile from raw data.

    Aggregates:
    - estimated_level: from User.level or derived from Vocabulary mastery distribution
    - mastery_by_level: GROUP BY exam_level, mastery_level from Vocabulary
    - strengths: exam levels with >60% mastered ratio
    - weaknesses: exam levels with >40% new/learning ratio
    - weekly_cycles: from LearningEvent aggregation

    Returns the updated profile as a dict.
    """
    profile = await get_or_create_profile(db, user_id)

    # 1. Compute mastery_by_level from Vocabulary
    mastery_by_level = await _compute_mastery_by_level(db, user_id)
    profile.mastery_by_level = mastery_by_level

    # 2. Derive estimated CEFR level
    profile.estimated_level = await _derive_level(db, user_id, mastery_by_level)

    # 3. Compute strengths/weaknesses
    strengths, weaknesses = _compute_strengths_weaknesses(mastery_by_level)
    profile.strengths = strengths
    profile.weaknesses = weaknesses

    # 4. Update weekly cycle count
    from app.services.learning_event_service import get_weekly_cycle_count

    weekly = await get_weekly_cycle_count(db, user_id)
    profile.weekly_cycles_completed = weekly["cycles_completed"]
    today = datetime.now(UTC).date()
    week_start = today - timedelta(days=today.weekday())
    profile.current_week_start = datetime(week_start.year, week_start.month, week_start.day, tzinfo=UTC)

    await db.commit()
    await db.refresh(profile)

    return _profile_to_dict(profile)


async def _compute_mastery_by_level(db: AsyncSession, user_id: str) -> dict:
    """Compute per-exam-level mastery breakdown from Vocabulary.

    Returns {"cet4": {"new": 5, "learning": 3, "reviewing": 2, "mastered": 10, "due": 1}, ...}
    """
    now = datetime.now(UTC)

    # Group by exam_level + mastery_level
    result = await db.execute(
        select(
            Vocabulary.exam_level,
            Vocabulary.mastery_level,
            func.count(Vocabulary.id).label("count"),
        )
        .where(
            Vocabulary.user_id == user_id,
            Vocabulary.exam_level.isnot(None),
        )
        .group_by(Vocabulary.exam_level, Vocabulary.mastery_level)
    )

    breakdown: dict[str, dict[str, int]] = {}
    for row in result:
        level = row.exam_level
        mastery = row.mastery_level or "new"
        count = row.count
        if level not in breakdown:
            breakdown[level] = {"new": 0, "learning": 0, "reviewing": 0, "mastered": 0, "due": 0, "total": 0}
        breakdown[level][mastery] = count
        breakdown[level]["total"] += count

    # Count due words per level
    due_result = await db.execute(
        select(
            Vocabulary.exam_level,
            func.count(Vocabulary.id).label("due_count"),
        )
        .where(
            Vocabulary.user_id == user_id,
            Vocabulary.exam_level.isnot(None),
            (Vocabulary.next_review_at <= now) | (Vocabulary.next_review_at.is_(None)),
        )
        .group_by(Vocabulary.exam_level)
    )
    for row in due_result:
        if row.exam_level in breakdown:
            breakdown[row.exam_level]["due"] = row.due_count

    return breakdown


async def _derive_level(db: AsyncSession, user_id: str, mastery_by_level: dict) -> str:
    """Derive estimated CEFR level from vocabulary mastery distribution.

    Strategy: find the highest exam level where the user has >= 50% mastered
    words, then map that exam level to CEFR. If no level has >= 50% mastered,
    use the lowest level with any words.
    """
    if not mastery_by_level:
        # Check User.level as fallback
        from app.models.user import User

        result = await db.execute(select(User.level).where(User.id == user_id))
        user_level = result.scalar_one_or_none()
        return user_level or "A1"

    # Find highest level with >= 50% mastered
    best_level = None
    best_order = -1
    for level_key, stats in mastery_by_level.items():
        total = stats.get("total", 0)
        if total == 0:
            continue
        mastered_ratio = stats.get("mastered", 0) / total
        if mastered_ratio >= 0.5 and level_order(level_key) > best_order:
            best_level = level_key
            best_order = level_order(level_key)

    if best_level:
        return _EXAM_CEFR.get(best_level, "A1")

    # Fallback: use the lowest level with any words
    for level_key in sorted(mastery_by_level.keys(), key=level_order):
        if mastery_by_level[level_key].get("total", 0) > 0:
            return _EXAM_CEFR.get(level_key, "A1")

    return "A1"


def _compute_strengths_weaknesses(mastery_by_level: dict) -> tuple[list[str], list[str]]:
    """Compute strengths and weaknesses from mastery breakdown.

    Strengths: exam levels with >60% mastered ratio
    Weaknesses: exam levels with >40% new/learning ratio
    """
    strengths: list[str] = []
    weaknesses: list[str] = []

    for level_key, stats in mastery_by_level.items():
        total = stats.get("total", 0)
        if total == 0:
            continue
        mastered_ratio = stats.get("mastered", 0) / total
        new_learning_ratio = (stats.get("new", 0) + stats.get("learning", 0)) / total

        if mastered_ratio > 0.6:
            strengths.append(level_key)
        if new_learning_ratio > 0.4:
            weaknesses.append(level_key)

    return strengths, weaknesses


def _profile_to_dict(profile: UserLearningProfile) -> dict:
    """Convert profile model to response dict."""
    return {
        "estimated_level": profile.estimated_level,
        "current_streak": profile.current_streak,
        "longest_streak": profile.longest_streak,
        "weekly_cycles_completed": profile.weekly_cycles_completed,
        "mastery_by_level": profile.mastery_by_level,
        "strengths": profile.strengths,
        "weaknesses": profile.weaknesses,
    }
