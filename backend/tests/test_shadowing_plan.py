"""Tests for shadowing integration with the learning plan system."""

from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import hash_password
from app.models.learning import LearningRecord
from app.models.learning_plan import LearningEvent, LearningPlan, LearningPlanItem
from app.models.user import User
from app.models.video import Video, VideoSource, VideoStatus
from app.services import learning_plan_service
from tests.conftest import TestSessionLocal


async def _seed_user_with_in_progress_video() -> tuple[str, str, str]:
    """Create a user with an in-progress video learning record.

    Returns (user_id, video_id, plan_item_id after generation).
    """
    async with TestSessionLocal() as db:
        user = User(
            phone="13800000099",
            hashed_password=hash_password("test123"),
            name="Plan Shadow Tester",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        video = Video(
            title="Plan Shadow Video",
            source_url="https://www.youtube.com/watch?v=planshadow1",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            duration=120.0,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)

        # In-progress learning record (not completed)
        record = LearningRecord(
            user_id=user.id,
            video_id=video.id,
            completed=False,
            progress_percentage=40.0,
        )
        db.add(record)
        await db.commit()

        return user.id, video.id


class TestPlanIncludesShadowing:
    async def test_plan_includes_shadowing_item(self):
        """When user has in-progress video, plan should include a shadowing item."""
        user_id, video_id = await _seed_user_with_in_progress_video()

        async with TestSessionLocal() as db:
            plan_dict = await learning_plan_service.generate_daily_plan(db, user_id)

        # Find shadowing item
        shadowing_items = [item for item in plan_dict["items"] if item["item_type"] == "shadowing"]
        assert len(shadowing_items) == 1
        si = shadowing_items[0]
        assert si["video_id"] == video_id
        assert si["item_config"]["sentence_count"] == 5

    async def test_plan_no_shadowing_without_in_progress(self):
        """Without in-progress videos, no shadowing item should appear."""
        async with TestSessionLocal() as db:
            user = User(
                phone="13800000098",
                hashed_password=hash_password("test123"),
                name="No Progress User",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            user_id = user.id

        async with TestSessionLocal() as db:
            plan_dict = await learning_plan_service.generate_daily_plan(db, user_id)

        shadowing_items = [item for item in plan_dict["items"] if item["item_type"] == "shadowing"]
        assert len(shadowing_items) == 0


class TestCompleteShadowingItem:
    async def test_complete_shadowing_item_emits_event(self):
        """Completing a shadowing plan item should emit shadowed_sentences event."""
        user_id, _video_id = await _seed_user_with_in_progress_video()

        # Generate plan
        async with TestSessionLocal() as db:
            plan_dict = await learning_plan_service.generate_daily_plan(db, user_id)

        plan_id = plan_dict["id"]
        shadowing_items = [item for item in plan_dict["items"] if item["item_type"] == "shadowing"]
        assert len(shadowing_items) == 1
        item_id = shadowing_items[0]["id"]

        # Mark shadowing item as completed
        async with TestSessionLocal() as db:
            result = await learning_plan_service.mark_plan_item_completed(
                db,
                plan_id,
                item_id,
                user_id,
            )
            assert result["completed"] is True

        # Verify shadowed_sentences event was emitted
        async with TestSessionLocal() as db:
            event_result = await db.execute(
                select(LearningEvent).where(
                    LearningEvent.user_id == user_id,
                    LearningEvent.event_type == "shadowed_sentences",
                )
            )
            event = event_result.scalar_one_or_none()
            assert event is not None

    async def test_estimate_minutes_includes_shadowing(self):
        """_estimate_minutes should account for shadowing items."""
        items = [
            {"item_type": "shadowing", "item_config": {"sentence_count": 5}},
            {"item_type": "review_words", "item_config": {"count": 10}},
        ]
        minutes = learning_plan_service._estimate_minutes(items, None)
        # shadowing: 5 sentences * 1 min = 5; review: 10 words * 1 min = 10
        assert minutes == 15
