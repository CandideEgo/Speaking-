"""Retired LearningEvent types must never produce new learning records.

The retired-feature compatibility layer (``app.services.learning_event_service``)
used to be fed by shadowing/speaking/weekly-report producers. The producers are
gone, but old workers or queued code can still call ``emit_event`` with a
retired type; the service must drop it instead of writing rows that would
inflate profiles/streaks. This is the remaining live half of the old
``test_shadowing_model.py`` — the model itself was dropped in the 2026-10
cleanup (migration ``c3d4e5f6a7b8``).
"""

from sqlalchemy import select

from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.services.learning_event_service import EVENT_SHADOWED_SENTENCES, VALID_EVENT_TYPES, emit_event
from tests.conftest import TestSessionLocal


async def test_retired_shadowing_event_does_not_write(client, auth_headers):
    """Retired event types must not produce new learning records."""
    user_id = (await client.get("/api/v1/users/me", headers=auth_headers)).json()["id"]

    async with TestSessionLocal() as db:
        # Ensure profile exists for streak/counter updates.
        db.add(UserLearningProfile(user_id=user_id))
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
                LearningEvent.event_type == EVENT_SHADOWED_SENTENCES,
            )
        )
        assert result.scalar_one_or_none() is None


def test_retired_shadowing_not_in_valid_types():
    """shadowed_sentences stays out of VALID_EVENT_TYPES (no warning path)."""
    assert EVENT_SHADOWED_SENTENCES not in VALID_EVENT_TYPES
