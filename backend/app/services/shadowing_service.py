"""Shadowing service — create/list/stats for sentence read-along attempts.

Lightweight shadowing (no AI scoring): user records audio per subtitle
sentence, compares with original. Each attempt is persisted and feeds the
learning loop north-star metric via LearningEvent(shadowed_sentences).
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning_plan import UserLearningProfile
from app.models.shadowing import ShadowingAttempt
from app.services import learning_event_service

logger = logging.getLogger(__name__)


async def create_attempt(
    db: AsyncSession,
    user_id: str,
    video_id: str,
    audio_url: str,
    subtitle_id: str | None = None,
    duration_ms: int | None = None,
    is_satisfied: bool = False,
) -> dict:
    """Create a shadowing attempt, emit learning event, update profile counter."""
    attempt = ShadowingAttempt(
        user_id=user_id,
        video_id=video_id,
        subtitle_id=subtitle_id,
        audio_url=audio_url,
        duration_ms=duration_ms,
        is_satisfied=is_satisfied,
    )
    db.add(attempt)
    await db.flush()

    # Emit learning event (non-blocking)
    await learning_event_service.emit_event(
        db,
        user_id=user_id,
        event_type=learning_event_service.EVENT_SHADOWED_SENTENCES,
        event_value=1,
        video_id=video_id,
    )

    # Increment profile counter
    profile = await learning_event_service._get_or_create_profile(db, user_id)
    profile.total_shadowing_count = (profile.total_shadowing_count or 0) + 1

    await db.commit()
    await db.refresh(attempt)

    return _attempt_to_dict(attempt)


async def list_by_video(
    db: AsyncSession,
    user_id: str,
    video_id: str,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Paginated list of shadowing attempts for a video, newest first."""
    offset = (page - 1) * page_size

    count_result = await db.execute(
        select(func.count(ShadowingAttempt.id)).where(
            ShadowingAttempt.user_id == user_id,
            ShadowingAttempt.video_id == video_id,
        )
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(ShadowingAttempt)
        .where(
            ShadowingAttempt.user_id == user_id,
            ShadowingAttempt.video_id == video_id,
        )
        .order_by(ShadowingAttempt.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    attempts = result.scalars().all()

    return {
        "items": [_attempt_to_dict(a) for a in attempts],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": offset + page_size < total,
    }


async def get_stats(db: AsyncSession, user_id: str) -> dict:
    """Aggregate shadowing statistics for a user."""
    # Total attempts
    total_result = await db.execute(
        select(func.count(ShadowingAttempt.id)).where(
            ShadowingAttempt.user_id == user_id,
        )
    )
    total_attempts = total_result.scalar() or 0

    # Satisfied count
    satisfied_result = await db.execute(
        select(func.count(ShadowingAttempt.id)).where(
            ShadowingAttempt.user_id == user_id,
            ShadowingAttempt.is_satisfied == True,
        )
    )
    satisfied_count = satisfied_result.scalar() or 0

    # Distinct videos shadowed
    videos_result = await db.execute(
        select(func.count(func.distinct(ShadowingAttempt.video_id))).where(
            ShadowingAttempt.user_id == user_id,
        )
    )
    videos_shadowed = videos_result.scalar() or 0

    # Today's count
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today_result = await db.execute(
        select(func.count(ShadowingAttempt.id)).where(
            ShadowingAttempt.user_id == user_id,
            ShadowingAttempt.created_at >= today_start,
        )
    )
    today_count = today_result.scalar() or 0

    return {
        "total_attempts": total_attempts,
        "satisfied_count": satisfied_count,
        "videos_shadowed": videos_shadowed,
        "today_count": today_count,
    }


def _attempt_to_dict(attempt: ShadowingAttempt) -> dict:
    return {
        "id": attempt.id,
        "user_id": attempt.user_id,
        "video_id": attempt.video_id,
        "subtitle_id": attempt.subtitle_id,
        "audio_url": attempt.audio_url,
        "duration_ms": attempt.duration_ms,
        "is_satisfied": attempt.is_satisfied,
        "created_at": attempt.created_at.isoformat() if attempt.created_at else None,
    }
