"""Real independent PostgreSQL transactions for teaching races.

The shared integration fixture rebuilds the explicitly supplied throwaway DB.
Never point PG_TEST_URL at a development, UI, or production database.
"""

import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.core.database import get_async_session_maker
from app.core.errors import AppError
from app.models.teaching import (
    ExamAnalysisRevision,
    LearningEventOutbox,
    TeachingAttempt,
    TeachingItem,
    TeachingSession,
)
from app.services import v2_access
from app.services.teaching import service
from app.services.teaching.principal import Principal
from tests.teaching_fixtures import seed_original_content

pytestmark = pytest.mark.integration


async def seed(monkeypatch):
    async with get_async_session_maker()() as db:
        user, revision, _question, _candidate = await seed_original_content(db)
        monkeypatch.setattr(
            v2_access, "get_settings", lambda: SimpleNamespace(teaching_enabled=True, teaching_allowed_user_ids=user.id)
        )
        return user.id, revision.id


async def start(user_id, revision_id, operation_id):
    async with get_async_session_maker()() as db:
        result = await service.create_session(
            db, Principal(user_id), {"operation_id": operation_id, "content_revision_id": revision_id}
        )
        await db.commit()
        return result


async def test_concurrent_identical_start_has_one_session_and_receipt(monkeypatch):
    user_id, revision_id = await seed(monkeypatch)
    barrier = asyncio.Barrier(2)

    async def invoke():
        await barrier.wait()
        return await start(user_id, revision_id, "same-start")

    first, second = await asyncio.gather(invoke(), invoke())
    assert first["id"] == second["id"]
    assert sorted([first["replayed"], second["replayed"]]) == [False, True]
    async with get_async_session_maker()() as db:
        assert await db.scalar(select(func.count()).select_from(TeachingSession)) == 1


async def test_preloaded_same_revision_two_answers_accept_only_one(monkeypatch):
    user_id, revision_id = await seed(monkeypatch)
    state = await start(user_id, revision_id, "start")
    barrier = asyncio.Barrier(2)

    async def invoke(operation_id):
        async with get_async_session_maker()() as db:
            # Deliberately preload stale ORM identities before the lock query.
            preloaded = (
                await db.get(TeachingSession, state["id"]),
                await db.get(TeachingItem, state["current_item_id"]),
                await db.get(ExamAnalysisRevision, revision_id),
            )
            assert preloaded[0].revision == 1
            await barrier.wait()
            try:
                result = await service.submit_attempt(
                    db,
                    Principal(user_id),
                    state["id"],
                    {
                        "operation_id": operation_id,
                        "expected_revision": state["revision"],
                        "item_id": state["current_item_id"],
                        "answer": "A",
                    },
                )
                await db.commit()
                return result
            except AppError as exc:
                await db.rollback()
                return exc.code

    results = await asyncio.gather(invoke("answer-one"), invoke("answer-two"))
    assert sum(isinstance(result, dict) for result in results) == 1
    assert "TEACHING_REVISION_CONFLICT" in results
    async with get_async_session_maker()() as db:
        assert await db.scalar(select(func.count()).select_from(TeachingAttempt)) == 1
        assert await db.scalar(select(func.count()).select_from(LearningEventOutbox)) == 1
        assert (await db.get(TeachingSession, state["id"])).revision == 2


async def test_cross_session_same_question_grants_initial_once(monkeypatch):
    user_id, revision_id = await seed(monkeypatch)
    one = await start(user_id, revision_id, "start-one")
    two = await start(user_id, revision_id, "start-two")
    barrier = asyncio.Barrier(2)

    async def invoke(state, operation_id):
        async with get_async_session_maker()() as db:
            await barrier.wait()
            result = await service.submit_attempt(
                db,
                Principal(user_id),
                state["id"],
                {
                    "operation_id": operation_id,
                    "expected_revision": state["revision"],
                    "item_id": state["current_item_id"],
                    "answer": "A",
                },
            )
            await db.commit()
            return result["attempts"][0]

    first, second = await asyncio.gather(invoke(one, "answer-one"), invoke(two, "answer-two"))
    assert sorted([first["role"], second["role"]]) == ["initial", "retry"]
    assert sorted(
        [first["assistance_snapshot"]["feedback_count"], second["assistance_snapshot"]["feedback_count"]]
    ) == [0, 1]
