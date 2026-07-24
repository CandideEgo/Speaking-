"""Tests for ShadowingAttempt model and shadowed_sentences LearningEvent type."""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.shadowing import ShadowingAttempt
from app.models.user import User
from app.models.video import Video, VideoSource, VideoStatus
from app.services.learning_event_service import EVENT_SHADOWED_SENTENCES, emit_event
from tests.conftest import TestSessionLocal


async def _seed_user() -> str:
    async with TestSessionLocal() as db:
        user = User(
            phone="13800000001",
            hashed_password=hash_password("test123"),
            name="Shadow Tester",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


async def _seed_video() -> str:
    async with TestSessionLocal() as db:
        video = Video(
            title="Shadowing Test Video",
            source_url="https://www.youtube.com/watch?v=shadow1",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            duration=60.0,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)
        return video.id


class TestShadowingAttemptModel:
    async def test_create_shadowing_attempt(self):
        user_id = await _seed_user()
        video_id = await _seed_video()

        async with TestSessionLocal() as db:
            attempt = ShadowingAttempt(
                user_id=user_id,
                video_id=video_id,
                audio_url="/media/shadowing/test.webm",
                duration_ms=3200,
                is_satisfied=True,
            )
            db.add(attempt)
            await db.commit()
            await db.refresh(attempt)

            assert attempt.id is not None
            assert attempt.user_id == user_id
            assert attempt.video_id == video_id
            assert attempt.audio_url == "/media/shadowing/test.webm"
            assert attempt.duration_ms == 3200
            assert attempt.is_satisfied is True
            assert attempt.subtitle_id is None
            assert attempt.created_at is not None

    async def test_shadowing_attempt_requires_user_and_video(self):
        """audio_url is NOT NULL and user_id/video_id are NOT NULL FK columns."""
        video_id = await _seed_video()

        async with TestSessionLocal() as db:
            # Missing audio_url (NOT NULL)
            attempt = ShadowingAttempt(
                user_id="nonexistent-user-id",
                video_id=video_id,
                audio_url=None,  # type: ignore[arg-type]
            )
            db.add(attempt)
            with pytest.raises(IntegrityError):
                await db.commit()

    async def test_shadowing_attempt_default_is_satisfied_false(self):
        user_id = await _seed_user()
        video_id = await _seed_video()

        async with TestSessionLocal() as db:
            attempt = ShadowingAttempt(
                user_id=user_id,
                video_id=video_id,
                audio_url="/media/shadowing/default.webm",
            )
            db.add(attempt)
            await db.commit()
            await db.refresh(attempt)

            assert attempt.is_satisfied is False


class TestShadowingEventType:
    async def test_emit_event_accepts_shadowed_sentences(self):
        """emit_event with shadowed_sentences should write a LearningEvent row."""
        user_id = await _seed_user()

        async with TestSessionLocal() as db:
            # Ensure profile exists for streak/counter updates
            profile = UserLearningProfile(user_id=user_id)
            db.add(profile)
            await db.commit()

        async with TestSessionLocal() as db:
            await emit_event(
                db,
                user_id=user_id,
                event_type=EVENT_SHADOWED_SENTENCES,
                event_value=3,
            )
            await db.commit()

        async with TestSessionLocal() as db:
            result = await db.execute(
                select(LearningEvent).where(
                    LearningEvent.user_id == user_id,
                    LearningEvent.event_type == "shadowed_sentences",
                )
            )
            event = result.scalar_one_or_none()
            assert event is not None
            assert event.event_value == 3

    async def test_emit_event_shadowed_sentences_in_valid_types(self):
        """shadowed_sentences is in VALID_EVENT_TYPES (no warning path)."""
        from app.services.learning_event_service import VALID_EVENT_TYPES

        assert EVENT_SHADOWED_SENTENCES in VALID_EVENT_TYPES


class TestProfileShadowingCount:
    async def test_profile_total_shadowing_count_default_zero(self):
        user_id = await _seed_user()

        async with TestSessionLocal() as db:
            profile = UserLearningProfile(user_id=user_id)
            db.add(profile)
            await db.commit()
            await db.refresh(profile)

            assert profile.total_shadowing_count == 0
