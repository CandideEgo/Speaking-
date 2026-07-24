"""Learning plan service — rule-based daily plan generation (ADR-0012).

Generates a daily learning plan for a user using a priority queue:
  1. Due vocabulary reviews (SM-2 next_review_at <= now)
  2. Continue in-progress videos (LearningRecord with progress < 100%)
  2.5. Shadowing practice for in-progress videos (sentence read-along)
  3. New videos matching user's target_exam CEFR band
  4. Practice session for recently learned words
  5. Vocabulary drill (fill remaining goal capacity)

Plans are cached per day — calling generate_daily_plan again returns the
same plan. AI-powered plan generation (Pro feature) is in ai_plan_service.
"""

import logging
from datetime import UTC, date, datetime

from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import commit_refresh
from app.core.exam_levels import EXAM_LEVELS, level_order
from app.models.learning import LearningRecord, Vocabulary
from app.models.learning_plan import LearningPlan, LearningPlanItem, UserLearningProfile
from app.models.preferences import UserPreferences
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.services import learning_event_service

logger = logging.getLogger(__name__)

# Limits for plan items
MAX_DUE_REVIEW_WORDS = 20
MAX_CONTINUE_VIDEOS = 3
MAX_NEW_VIDEOS = 2
DEFAULT_PRACTICE_ITEMS = 10
DEFAULT_VOCAB_DRILL_COUNT = 10


async def generate_daily_plan(db: AsyncSession, user_id: str) -> dict:
    """Generate or return today's learning plan.

    If a plan already exists for today, return it. Otherwise, build a new
    plan using the rule-based engine and persist it.

    Returns the plan dict with items.
    """
    today = await learning_event_service._get_user_local_date(db, user_id)

    # Check if plan already exists for today
    result = await db.execute(
        select(LearningPlan).where(
            LearningPlan.user_id == user_id,
            LearningPlan.plan_date == today,
        )
    )
    plan = result.scalar_one_or_none()

    if plan:
        return _plan_to_dict(plan)

    # Build new plan
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    prefs = await _get_preferences(db, user_id)
    items = await _build_plan_items(db, user, prefs, today)

    # Create plan row
    plan = LearningPlan(
        user_id=user_id,
        plan_date=today,
        generation_method="rule",
        total_review_words=sum(
            (i.get("item_config") or {}).get("count", 0) for i in items if i.get("item_type") == "review_words"
        ),
        total_new_words=sum(1 for i in items if i.get("item_type") == "watch_video"),
        total_practice_items=sum(
            (i.get("item_config") or {}).get("item_count", 0) for i in items if i.get("item_type") == "practice"
        ),
        estimated_minutes=_estimate_minutes(items, prefs),
    )
    db.add(plan)
    await db.flush()

    # Create item rows
    for idx, item_data in enumerate(items):
        item = LearningPlanItem(
            plan_id=plan.id,
            sort_order=idx,
            item_type=item_data["item_type"],
            video_id=item_data.get("video_id"),
            item_config=item_data.get("item_config"),
        )
        db.add(item)

    # Update profile's last_plan_generated_at
    profile = await learning_event_service._get_or_create_profile(db, user_id)
    profile.last_plan_generated_at = datetime.now(UTC)

    await db.commit()

    # Re-query with items eagerly loaded to avoid async lazy-load issues
    result = await db.execute(
        select(LearningPlan).options(selectinload(LearningPlan.items)).where(LearningPlan.id == plan.id)
    )
    plan = result.scalar_one()

    return _plan_to_dict(plan)


async def _build_plan_items(
    db: AsyncSession,
    user: User,
    prefs: UserPreferences | None,
    today: date,
) -> list[dict]:
    """Rule-based plan builder. Priority queue of items."""
    items: list[dict] = []
    target_exam = prefs.target_exam if prefs else None
    daily_goal_value = prefs.daily_goal_value if prefs else 5
    daily_goal_type = prefs.daily_goal_type if prefs else "words"

    # 1. Due vocabulary reviews
    due_count = await _count_due_words(db, user.id)
    if due_count > 0:
        review_count = min(
            due_count, daily_goal_value if daily_goal_type == "words" else MAX_DUE_REVIEW_WORDS, MAX_DUE_REVIEW_WORDS
        )
        items.append(
            {
                "item_type": "review_words",
                "item_config": {
                    "count": review_count,
                    "exam_level": target_exam,
                },
            }
        )

    # 2. Continue in-progress videos
    in_progress = await _get_in_progress_videos(db, user.id)
    for record, video in in_progress[:MAX_CONTINUE_VIDEOS]:
        items.append(
            {
                "item_type": "watch_video",
                "video_id": video.id,
                "item_config": {
                    "title": video.title if hasattr(video, "title") else "",
                    "thumbnail_url": getattr(video, "thumbnail_url", None),
                    "progress": record.progress_percentage or 0,
                },
            }
        )

    # 2.5 Shadowing practice for in-progress videos
    if in_progress:
        items.append(
            {
                "item_type": "shadowing",
                "video_id": in_progress[0][1].id,
                "item_config": {
                    "title": in_progress[0][1].title if hasattr(in_progress[0][1], "title") else "",
                    "sentence_count": 5,
                },
            }
        )

    # 3. New videos matching target exam CEFR band
    if target_exam:
        new_videos = await _get_recommended_videos(db, user.id, target_exam)
        for video in new_videos[:MAX_NEW_VIDEOS]:
            items.append(
                {
                    "item_type": "watch_video",
                    "video_id": video.id,
                    "item_config": {
                        "title": video.title if hasattr(video, "title") else "",
                        "thumbnail_url": getattr(video, "thumbnail_url", None),
                        "progress": 0,
                    },
                }
            )

    # 4. Practice session for recently learned words
    if in_progress:
        items.append(
            {
                "item_type": "practice",
                "video_id": in_progress[0][1].id if in_progress else None,
                "item_config": {
                    "exam_level": target_exam,
                    "item_count": DEFAULT_PRACTICE_ITEMS,
                },
            }
        )

    # 5. Vocabulary drill (fill remaining capacity)
    total_words_planned = sum(
        (i.get("item_config") or {}).get("count", 0) for i in items if i.get("item_type") in ("review_words",)
    )
    remaining = (
        max(daily_goal_value - total_words_planned, 0) if daily_goal_type == "words" else DEFAULT_VOCAB_DRILL_COUNT
    )
    if remaining > 0:
        items.append(
            {
                "item_type": "vocab_drill",
                "item_config": {
                    "count": min(remaining, DEFAULT_VOCAB_DRILL_COUNT),
                    "due_only": False,
                },
            }
        )

    return items


async def mark_plan_item_completed(
    db: AsyncSession,
    plan_id: str,
    item_id: str,
    user_id: str,
    result_data: dict | None = None,
) -> dict:
    """Mark a plan item as completed. Emits LearningEvent.

    Returns {"completed": bool, "plan_completed": bool, "goal_met": bool}
    """
    # Fetch the plan item
    item_result = await db.execute(
        select(LearningPlanItem).where(
            LearningPlanItem.id == item_id,
            LearningPlanItem.plan_id == plan_id,
        )
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise ValueError("Plan item not found")

    # Verify ownership
    plan_result = await db.execute(
        select(LearningPlan).where(LearningPlan.id == plan_id, LearningPlan.user_id == user_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise ValueError("Plan not found or not owned by user")

    if item.completed:
        return {"completed": True, "plan_completed": plan.completed, "goal_met": False}

    # Mark item completed
    item.completed = True
    item.completed_at = datetime.now(UTC)

    # Emit learning event based on item type
    event_type_map = {
        "review_words": learning_event_service.EVENT_REVIEWED_WORDS,
        "watch_video": learning_event_service.EVENT_COMPLETED_VIDEO,
        "practice": learning_event_service.EVENT_PRACTICED_ITEMS,
        "vocab_drill": learning_event_service.EVENT_PRACTICED_ITEMS,
        "shadowing": learning_event_service.EVENT_SHADOWED_SENTENCES,
    }
    event_type = event_type_map.get(item.item_type)
    if event_type:
        event_value = 1
        if item.item_type == "review_words":
            event_value = (item.item_config or {}).get("count", 1)
        elif item.item_type in ("practice", "vocab_drill"):
            event_value = (item.item_config or {}).get("item_count", 1) or (item.item_config or {}).get("count", 1)

        await learning_event_service.emit_event(
            db,
            user_id,
            event_type,
            event_value,
            video_id=item.video_id,
            plan_id=plan_id,
        )

    # Check if all items are completed
    all_items_result = await db.execute(select(LearningPlanItem).where(LearningPlanItem.plan_id == plan_id))
    all_items = all_items_result.scalars().all()
    plan_completed = all(i.completed for i in all_items)

    if plan_completed and not plan.completed:
        plan.completed = True
        plan.completed_at = datetime.now(UTC)
        await learning_event_service.emit_event(
            db,
            user_id,
            learning_event_service.EVENT_COMPLETED_PLAN,
            1,
            plan_id=plan_id,
        )

    # Check goal status
    progress = await learning_event_service.get_today_progress(db, user_id)

    await db.commit()

    return {
        "completed": True,
        "plan_completed": plan_completed,
        "goal_met": progress.get("goal_met", False),
    }


async def get_plan_history(
    db: AsyncSession,
    user_id: str,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """Get paginated history of past plans."""
    offset = (page - 1) * page_size

    # Count total
    count_result = await db.execute(select(func.count(LearningPlan.id)).where(LearningPlan.user_id == user_id))
    total = count_result.scalar() or 0

    # Fetch plans
    result = await db.execute(
        select(LearningPlan)
        .where(LearningPlan.user_id == user_id)
        .order_by(LearningPlan.plan_date.desc())
        .offset(offset)
        .limit(page_size)
    )
    plans = result.scalars().all()

    items = []
    for plan in plans:
        # Count completed items
        items_result = await db.execute(
            select(
                func.count(LearningPlanItem.id).label("total"),
                func.sum(func.cast(LearningPlanItem.completed, Integer)).label("completed_count"),
            ).where(LearningPlanItem.plan_id == plan.id)
        )
        row = items_result.one()
        items.append(
            {
                "id": plan.id,
                "plan_date": plan.plan_date.isoformat(),
                "generation_method": plan.generation_method,
                "completed": plan.completed,
                "total_review_words": plan.total_review_words,
                "total_new_words": plan.total_new_words,
                "total_practice_items": plan.total_practice_items,
                "estimated_minutes": plan.estimated_minutes,
                "items_completed": row.completed_count or 0,
                "items_total": row.total or 0,
            }
        )

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "has_more": offset + page_size < total,
        "total": total,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_preferences(db: AsyncSession, user_id: str) -> UserPreferences | None:
    """Get user preferences."""
    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))
    return result.scalar_one_or_none()


async def _count_due_words(db: AsyncSession, user_id: str) -> int:
    """Count vocabulary words due for review."""
    now = datetime.now(UTC)
    result = await db.execute(
        select(func.count(Vocabulary.id)).where(
            Vocabulary.user_id == user_id,
            (Vocabulary.next_review_at <= now) | (Vocabulary.next_review_at.is_(None)),
        )
    )
    return result.scalar() or 0


async def _get_in_progress_videos(
    db: AsyncSession,
    user_id: str,
    limit: int = MAX_CONTINUE_VIDEOS,
) -> list[tuple[LearningRecord, Video]]:
    """Get in-progress video records with their video info."""
    result = await db.execute(
        select(LearningRecord, Video)
        .join(Video, LearningRecord.video_id == Video.id)
        .where(
            LearningRecord.user_id == user_id,
            LearningRecord.completed == False,
        )
        .order_by(LearningRecord.last_accessed_at.desc())
        .limit(limit)
    )
    return [row for row in result.all()]


async def _get_recommended_videos(
    db: AsyncSession,
    user_id: str,
    target_exam: str,
    limit: int = MAX_NEW_VIDEOS,
) -> list[Video]:
    """Get new videos matching the user's target exam CEFR band.

    Excludes videos the user already has learning records for.
    """
    # Get CEFR band for target exam
    exam_cfr_band = _get_cfr_band(target_exam)

    # Get video IDs the user has already watched
    watched_result = await db.execute(select(LearningRecord.video_id).where(LearningRecord.user_id == user_id))
    watched_ids = {row[0] for row in watched_result.all()}

    # Query available videos
    stmt = (
        select(Video)
        .where(
            Video.status == VideoStatus.ready,
            Video.is_published == True,
        )
        .order_by(Video.score.desc())
        .limit(limit * 3)  # Over-fetch to filter by CEFR band
    )
    if watched_ids:
        stmt = stmt.where(Video.id.notin_(watched_ids))

    result = await db.execute(stmt)
    videos = result.scalars().all()

    # Filter by CEFR band if possible
    if exam_cfr_band:
        matching = [v for v in videos if v.difficulty_level in exam_cfr_band]
        if matching:
            return matching[:limit]

    # Fallback: return top-scored videos
    return list(videos[:limit])


def _get_cfr_band(target_exam: str) -> set[str] | None:
    """Map target_exam to a CEFR difficulty band for video filtering."""
    bands = {
        "gaoKao": {"A2", "B1"},
        "cet4": {"A2", "B1"},
        "cet6": {"B1", "B2"},
        "ky": {"B1", "B2"},
        "ielts": {"B2", "C1"},
        "toefl": {"B2", "C1"},
        "gre": {"C1", "C2"},
    }
    return bands.get(target_exam)


def _estimate_minutes(items: list[dict], prefs: UserPreferences | None) -> int:
    """Estimate total minutes for the plan."""
    total = 0
    for item in items:
        item_type = item.get("item_type")
        config = item.get("item_config") or {}
        if item_type == "review_words":
            total += config.get("count", 0)  # ~1 min per word
        elif item_type == "watch_video":
            total += 5  # Estimated 5 min per video session
        elif item_type == "shadowing":
            total += config.get("sentence_count", 5)  # ~1 min per sentence
        elif item_type in ("practice", "vocab_drill"):
            count = config.get("item_count", 0) or config.get("count", 0)
            total += max(count // 2, 2)  # ~30s per item
    return total


def _plan_to_dict(plan: LearningPlan) -> dict:
    """Convert plan model to response dict."""
    items = []
    for item in plan.items:
        items.append(
            {
                "id": item.id,
                "sort_order": item.sort_order,
                "item_type": item.item_type,
                "video_id": item.video_id,
                "item_config": item.item_config,
                "completed": item.completed,
                "completed_at": item.completed_at.isoformat() if item.completed_at else None,
            }
        )

    return {
        "id": plan.id,
        "plan_date": plan.plan_date.isoformat(),
        "generation_method": plan.generation_method,
        "total_review_words": plan.total_review_words,
        "total_new_words": plan.total_new_words,
        "total_practice_items": plan.total_practice_items,
        "estimated_minutes": plan.estimated_minutes,
        "completed": plan.completed,
        "items": items,
    }
