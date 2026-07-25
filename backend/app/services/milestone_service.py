"""Milestone service — achievement rule engine (Sprint 4, E4).

Checks milestone rules against user data and awards new achievements.
Each milestone type can only be achieved once per user (enforced by DB
unique constraint + pre-check).

Called from learning_event_service.emit_event() after streak/counter updates.
Non-blocking: failures are logged but never raised.
"""

import logging
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning import Vocabulary
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.milestone import (
    MILESTONE_COMPLETED_10_VIDEOS,
    MILESTONE_FIRST_REVIEW,
    MILESTONE_FIRST_SHADOWING,
    MILESTONE_MASTERED_100,
    MILESTONE_STREAK_7,
    MILESTONE_STREAK_30,
    MILESTONE_VOCAB_50,
    MILESTONE_VOCAB_200,
    MasterySnapshot,
    UserMilestone,
)
from app.models.shadowing import ShadowingAttempt

logger = logging.getLogger(__name__)


async def check_and_award(db: AsyncSession, user_id: str) -> list[dict]:
    """Check all milestone rules and award newly achieved milestones.

    Returns a list of newly awarded milestone dicts:
    [{"id": ..., "milestone_type": ..., "achieved_at": ..., "metadata_json": ...}]

    Non-blocking: wraps in try/except, never raises.
    Does NOT commit — caller commits.
    """
    try:
        return await _check_and_award_inner(db, user_id)
    except Exception:
        logger.warning("Milestone check failed for user %s", user_id, exc_info=True)
        return []


async def _check_and_award_inner(db: AsyncSession, user_id: str) -> list[dict]:
    """Inner implementation of check_and_award."""
    # Get already-achieved milestone types for this user
    existing_result = await db.execute(select(UserMilestone.milestone_type).where(UserMilestone.user_id == user_id))
    existing_types = {row[0] for row in existing_result}

    newly_awarded: list[dict] = []

    # --- Vocab count milestones ---
    vocab_count = await _count_vocab(db, user_id)
    if vocab_count >= 50 and MILESTONE_VOCAB_50 not in existing_types:
        m = await _award(db, user_id, MILESTONE_VOCAB_50, {"word_count": vocab_count})
        newly_awarded.append(m)
        existing_types.add(MILESTONE_VOCAB_50)

    if vocab_count >= 200 and MILESTONE_VOCAB_200 not in existing_types:
        m = await _award(db, user_id, MILESTONE_VOCAB_200, {"word_count": vocab_count})
        newly_awarded.append(m)
        existing_types.add(MILESTONE_VOCAB_200)

    # --- Mastered words milestone ---
    mastered_count = await _count_mastered(db, user_id)
    if mastered_count >= 100 and MILESTONE_MASTERED_100 not in existing_types:
        m = await _award(db, user_id, MILESTONE_MASTERED_100, {"mastered_count": mastered_count})
        newly_awarded.append(m)
        existing_types.add(MILESTONE_MASTERED_100)

    # --- Streak milestones ---
    streak = await _get_streak(db, user_id)
    if streak >= 7 and MILESTONE_STREAK_7 not in existing_types:
        m = await _award(db, user_id, MILESTONE_STREAK_7, {"streak": streak})
        newly_awarded.append(m)
        existing_types.add(MILESTONE_STREAK_7)

    if streak >= 30 and MILESTONE_STREAK_30 not in existing_types:
        m = await _award(db, user_id, MILESTONE_STREAK_30, {"streak": streak})
        newly_awarded.append(m)
        existing_types.add(MILESTONE_STREAK_30)

    # --- Completed videos milestone ---
    video_count = await _count_completed_videos(db, user_id)
    if video_count >= 10 and MILESTONE_COMPLETED_10_VIDEOS not in existing_types:
        m = await _award(db, user_id, MILESTONE_COMPLETED_10_VIDEOS, {"video_count": video_count})
        newly_awarded.append(m)
        existing_types.add(MILESTONE_COMPLETED_10_VIDEOS)

    # --- First shadowing milestone ---
    if MILESTONE_FIRST_SHADOWING not in existing_types:
        shadowing_count = await _count_shadowing(db, user_id)
        if shadowing_count >= 1:
            m = await _award(db, user_id, MILESTONE_FIRST_SHADOWING, None)
            newly_awarded.append(m)
            existing_types.add(MILESTONE_FIRST_SHADOWING)

    # --- First review milestone ---
    if MILESTONE_FIRST_REVIEW not in existing_types:
        review_count = await _count_reviews(db, user_id)
        if review_count >= 1:
            m = await _award(db, user_id, MILESTONE_FIRST_REVIEW, None)
            newly_awarded.append(m)
            existing_types.add(MILESTONE_FIRST_REVIEW)

    return newly_awarded


async def _award(db: AsyncSession, user_id: str, milestone_type: str, metadata: dict | None) -> dict:
    """Insert a new milestone row and return it as a dict."""
    milestone = UserMilestone(
        user_id=user_id,
        milestone_type=milestone_type,
        metadata_json=metadata,
    )
    db.add(milestone)
    await db.flush()
    await db.refresh(milestone)
    logger.info("Milestone awarded: user=%s type=%s", user_id, milestone_type)
    return {
        "id": milestone.id,
        "milestone_type": milestone.milestone_type,
        "achieved_at": milestone.achieved_at.isoformat() if milestone.achieved_at else None,
        "metadata_json": milestone.metadata_json,
    }


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------


async def _count_vocab(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(select(func.count(Vocabulary.id)).where(Vocabulary.user_id == user_id))
    return result.scalar() or 0


async def _count_mastered(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(func.count(Vocabulary.id)).where(
            Vocabulary.user_id == user_id,
            Vocabulary.mastery_level == "mastered",
        )
    )
    return result.scalar() or 0


async def _get_streak(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(select(UserLearningProfile.current_streak).where(UserLearningProfile.user_id == user_id))
    return result.scalar_one_or_none() or 0


async def _count_completed_videos(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(func.count(LearningEvent.id)).where(
            LearningEvent.user_id == user_id,
            LearningEvent.event_type == "completed_video",
        )
    )
    return result.scalar() or 0


async def _count_shadowing(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(select(func.count(ShadowingAttempt.id)).where(ShadowingAttempt.user_id == user_id))
    return result.scalar() or 0


async def _count_reviews(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(func.count(LearningEvent.id)).where(
            LearningEvent.user_id == user_id,
            LearningEvent.event_type == "reviewed_words",
        )
    )
    return result.scalar() or 0


# ---------------------------------------------------------------------------
# Public query functions
# ---------------------------------------------------------------------------


async def get_user_milestones(db: AsyncSession, user_id: str) -> list[dict]:
    """Get all milestones for a user, ordered by achieved_at desc."""
    result = await db.execute(
        select(UserMilestone).where(UserMilestone.user_id == user_id).order_by(UserMilestone.achieved_at.desc())
    )
    milestones = result.scalars().all()
    return [
        {
            "id": m.id,
            "milestone_type": m.milestone_type,
            "achieved_at": m.achieved_at.isoformat() if m.achieved_at else None,
            "metadata_json": m.metadata_json,
        }
        for m in milestones
    ]


async def get_latest_milestone(db: AsyncSession, user_id: str) -> dict | None:
    """Get the most recently achieved milestone for a user."""
    result = await db.execute(
        select(UserMilestone)
        .where(UserMilestone.user_id == user_id)
        .order_by(UserMilestone.achieved_at.desc())
        .limit(1)
    )
    m = result.scalar_one_or_none()
    if not m:
        return None
    return {
        "id": m.id,
        "milestone_type": m.milestone_type,
        "achieved_at": m.achieved_at.isoformat() if m.achieved_at else None,
        "metadata_json": m.metadata_json,
    }


async def get_mastery_trend(db: AsyncSession, user_id: str, weeks: int = 8) -> list[dict]:
    """Get mastery snapshots for the last N weeks, ordered by date asc."""
    from datetime import timedelta

    cutoff = date.today() - timedelta(weeks=weeks)
    result = await db.execute(
        select(MasterySnapshot)
        .where(
            MasterySnapshot.user_id == user_id,
            MasterySnapshot.snapshot_date >= cutoff,
        )
        .order_by(MasterySnapshot.snapshot_date.asc())
    )
    snapshots = result.scalars().all()
    return [
        {
            "date": s.snapshot_date.isoformat(),
            "mastery_json": s.mastery_json,
        }
        for s in snapshots
    ]


async def ensure_today_snapshot(db: AsyncSession, user_id: str, today: date, mastery_by_level: dict | None) -> None:
    """Write a mastery snapshot for today if one doesn't already exist.

    Lightweight: reads from the profile's cached mastery_by_level, does not
    recompute from raw data.
    """
    # Check if snapshot already exists for today
    existing = await db.execute(
        select(MasterySnapshot.id).where(
            MasterySnapshot.user_id == user_id,
            MasterySnapshot.snapshot_date == today,
        )
    )
    if existing.scalar_one_or_none():
        return

    snapshot = MasterySnapshot(
        user_id=user_id,
        snapshot_date=today,
        mastery_json=mastery_by_level,
    )
    db.add(snapshot)
    await db.flush()
