"""AI-powered learning plan generation service (ADR-0012, Pro feature).

Generates a personalized daily learning plan using the LLM, with context
from the user's profile, vocabulary mastery, recent events, and available
video pool. Falls back to the rule-based engine if AI generation fails.
"""

import json
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning import LearningRecord, Vocabulary
from app.models.learning_plan import LearningEvent, LearningPlan, LearningPlanItem, UserLearningProfile
from app.models.preferences import UserPreferences
from app.models.video import Video, VideoStatus
from app.services.ai_service import AIServiceError, get_ai_service

logger = logging.getLogger(__name__)


async def generate_ai_plan(db: AsyncSession, user_id: str) -> dict:
    """Generate an AI-powered learning plan. Pro-only.

    1. Gather context: profile, vocabulary stats, recent events, available videos
    2. Build a prompt with structured context
    3. Call LLM with JSON output
    4. Validate and persist the plan
    5. Return the plan dict

    Falls back to rule-based engine if AI fails.
    """
    # Gather context
    profile_summary = await _build_profile_summary(db, user_id)
    vocab_summary = await _build_vocabulary_summary(db, user_id)
    events_summary = await _build_events_summary(db, user_id)
    video_pool = await _build_video_pool_summary(db, user_id)

    # Get preferences
    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
    prefs = result.scalar_one_or_none()
    goal_type = prefs.daily_goal_type if prefs else "words"
    goal_value = prefs.daily_goal_value if prefs else 5
    target_exam = prefs.target_exam if prefs else None

    # Call AI
    try:
        ai_service = get_ai_service()
        ai_items = await ai_service.generate_learning_plan(
            profile_summary=profile_summary,
            vocabulary_summary=vocab_summary,
            recent_events_summary=events_summary,
            video_pool_summary=video_pool,
            daily_goal_type=goal_type,
            daily_goal_value=goal_value,
            target_exam=target_exam,
        )
    except AIServiceError as e:
        logger.error("AI plan generation failed, falling back to rule engine: %s", e)
        from app.services.learning_plan_service import generate_daily_plan

        return await generate_daily_plan(db, user_id)

    if not ai_items:
        logger.warning("AI plan returned empty items, falling back to rule engine")
        from app.services.learning_plan_service import generate_daily_plan

        return await generate_daily_plan(db, user_id)

    # Delete existing plan for today if any
    today = datetime.now(UTC).date()
    existing = await db.execute(
        select(LearningPlan).where(
            LearningPlan.user_id == user_id,
            LearningPlan.plan_date == today,
        )
    )
    for old_plan in existing.scalars().all():
        await db.delete(old_plan)

    # Build plan from AI items
    plan_items = []
    for idx, ai_item in enumerate(ai_items):
        item_type = ai_item["item_type"]
        video_id = ai_item.get("video_id")
        config = {}

        if item_type == "review_words":
            config = {"count": ai_item.get("count", 5), "exam_level": target_exam}
        elif item_type == "watch_video":
            # Look up video info
            if video_id:
                v_result = await db.execute(select(Video).where(Video.id == video_id))
                v = v_result.scalar_one_or_none()
                if v:
                    config = {
                        "title": v.title,
                        "thumbnail_url": v.thumbnail_url,
                        "progress": 0,
                    }
        elif item_type == "practice":
            config = {
                "exam_level": ai_item.get("exam_level", target_exam),
                "item_count": ai_item.get("item_count", 10),
            }
            video_id = ai_item.get("video_id")
        elif item_type == "vocab_drill":
            config = {
                "count": ai_item.get("count", 10),
                "due_only": ai_item.get("due_only", False),
            }

        plan_items.append(
            {
                "sort_order": idx,
                "item_type": item_type,
                "video_id": video_id,
                "item_config": config,
            }
        )

    # Create plan row
    plan = LearningPlan(
        user_id=user_id,
        plan_date=today,
        generation_method="ai",
        total_review_words=sum(
            (p.get("item_config") or {}).get("count", 0) for p in plan_items if p.get("item_type") == "review_words"
        ),
        total_new_words=sum(1 for p in plan_items if p.get("item_type") == "watch_video"),
        total_practice_items=sum(
            (p.get("item_config") or {}).get("item_count", 0) for p in plan_items if p.get("item_type") == "practice"
        ),
        estimated_minutes=0,  # AI doesn't estimate this well
    )
    db.add(plan)
    await db.flush()

    # Create item rows
    for item_data in plan_items:
        item = LearningPlanItem(
            plan_id=plan.id,
            sort_order=item_data["sort_order"],
            item_type=item_data["item_type"],
            video_id=item_data.get("video_id"),
            item_config=item_data.get("item_config"),
        )
        db.add(item)

    await db.commit()
    await db.refresh(plan)

    # Convert to dict
    from app.services.learning_plan_service import _plan_to_dict

    return _plan_to_dict(plan)


# ---------------------------------------------------------------------------
# Context builders
# ---------------------------------------------------------------------------


async def _build_profile_summary(db: AsyncSession, user_id: str) -> str:
    """Build a human-readable profile summary for the AI prompt."""
    result = await db.execute(select(UserLearningProfile).where(UserLearningProfile.user_id == user_id))
    profile = result.scalar_one_or_none()

    if not profile:
        return "New user, no profile data yet."

    parts = [
        f"Estimated level: {profile.estimated_level or 'unknown'}",
        f"Current streak: {profile.current_streak} days",
        f"Weekly cycles completed: {profile.weekly_cycles_completed}",
    ]
    if profile.mastery_by_level:
        parts.append(f"Mastery breakdown: {json.dumps(profile.mastery_by_level)}")
    if profile.strengths:
        parts.append(f"Strong areas: {', '.join(profile.strengths)}")
    if profile.weaknesses:
        parts.append(f"Weak areas: {', '.join(profile.weaknesses)}")

    return "\n".join(parts)


async def _build_vocabulary_summary(db: AsyncSession, user_id: str) -> str:
    """Build vocabulary mastery summary."""
    result = await db.execute(
        select(
            Vocabulary.exam_level,
            Vocabulary.mastery_level,
            func.count(Vocabulary.id).label("count"),
        )
        .where(Vocabulary.user_id == user_id, Vocabulary.exam_level.isnot(None))
        .group_by(Vocabulary.exam_level, Vocabulary.mastery_level)
    )

    lines = []
    for row in result:
        lines.append(f"  {row.exam_level}/{row.mastery_level}: {row.count} words")

    if not lines:
        return "No vocabulary data yet."

    return "\n".join(lines)


async def _build_events_summary(db: AsyncSession, user_id: str) -> str:
    """Build recent events summary (last 7 days)."""
    since = datetime.now(UTC) - timedelta(days=7)

    result = await db.execute(
        select(
            LearningEvent.event_type,
            func.count(LearningEvent.id).label("count"),
            func.sum(LearningEvent.event_value).label("total_value"),
        )
        .where(
            LearningEvent.user_id == user_id,
            LearningEvent.created_at >= since,
        )
        .group_by(LearningEvent.event_type)
    )

    lines = []
    for row in result:
        lines.append(f"  {row.event_type}: {row.count} events, total value {row.total_value}")

    if not lines:
        return "No learning events in the past 7 days."

    return "\n".join(lines)


async def _build_video_pool_summary(db: AsyncSession, user_id: str) -> str:
    """Build available video pool summary."""
    result = await db.execute(
        select(Video)
        .where(
            Video.status == VideoStatus.ready,
            Video.is_published == True,
        )
        .order_by(Video.score.desc())
        .limit(10)
    )
    videos = result.scalars().all()

    if not videos:
        return "No videos available."

    lines = []
    for v in videos:
        lines.append(f"  id={v.id} title={v.title} difficulty={v.difficulty_level}")

    return "\n".join(lines)
