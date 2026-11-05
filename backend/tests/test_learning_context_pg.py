"""Real PG evidence for consistent context reads; throwaway database only."""

import asyncio

import pytest
from sqlalchemy import text

from app.core.database import get_async_session_maker
from app.models.teaching import ExamAnalysisRevision
from app.services.teaching import service as core
from app.services.teaching.context import get_learning_context
from app.services.teaching.principal import Principal
from tests.teaching_fixtures import seed_original_content
from tests.test_teaching import action, enable

pytestmark = pytest.mark.integration


async def seed(monkeypatch):
    async with get_async_session_maker()() as db:
        user, revision, _, _ = await seed_original_content(db)
        enable(monkeypatch, user.id)
        principal = Principal(user.id)
        state = await core.create_session(db, principal, {"operation_id": "start", "content_revision_id": revision.id})
        await db.commit()
        return principal, state, revision.id


async def assert_blocked(writer_pid, reader_pid):
    # Observe the actual database wait, not an assumed ordering after sleep.
    async with asyncio.timeout(5):
        async with get_async_session_maker()() as observer:
            while True:
                blockers = await observer.scalar(text("SELECT pg_blocking_pids(:pid)"), {"pid": writer_pid})
                if reader_pid in blockers:
                    return
                await asyncio.sleep(0.01)


async def test_context_version_and_draft_cannot_mix_across_a_concurrent_write(monkeypatch):
    principal, state, _ = await seed(monkeypatch)
    maker = get_async_session_maker()
    async with maker() as reader, maker() as writer:
        reader_pid = await reader.scalar(text("SELECT pg_backend_pid()"))
        writer_pid = await writer.scalar(text("SELECT pg_backend_pid()"))
        frozen = await get_learning_context(reader, principal, state["id"])

        async def write():
            changed = await core.save_draft(writer, principal, state["id"], action(state, "draft", answer="B"))
            await writer.commit()
            return changed

        pending = asyncio.create_task(write())
        try:
            await assert_blocked(writer_pid, reader_pid)
            assert frozen.task.state_version == 1 and frozen.progress.draft_answer is None
            await reader.commit()
            changed = await asyncio.wait_for(pending, 5)
            assert changed["revision"] == 2
            fresh = await get_learning_context(reader, principal, state["id"])
            assert fresh.task.state_version == 2 and fresh.progress.draft_answer == "B"
        finally:
            if not pending.done():
                pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)


async def test_rights_withdrawal_is_serialized_with_projection(monkeypatch):
    principal, state, revision_id = await seed(monkeypatch)
    maker = get_async_session_maker()
    async with maker() as reader, maker() as writer:
        reader_pid = await reader.scalar(text("SELECT pg_backend_pid()"))
        writer_pid = await writer.scalar(text("SELECT pg_backend_pid()"))
        current = await get_learning_context(reader, principal, state["id"])
        assert not current.material.restricted

        async def withdraw():
            revision = await writer.get(ExamAnalysisRevision, revision_id)
            revision.status = "withdrawn"
            await writer.commit()

        pending = asyncio.create_task(withdraw())
        try:
            await assert_blocked(writer_pid, reader_pid)
            await reader.commit()
            await asyncio.wait_for(pending, 5)
            fresh = await get_learning_context(reader, principal, state["id"])
            assert fresh.material.restricted and fresh.allowed_actions == []
            assert all(card.kind == "status" for card in fresh.cards)
        finally:
            if not pending.done():
                pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)


async def test_two_context_readers_share_locks_without_blocking_each_other(monkeypatch):
    principal, state, _ = await seed(monkeypatch)
    maker = get_async_session_maker()
    async with maker() as first, maker() as second:
        one = await get_learning_context(first, principal, state["id"])
        two = await asyncio.wait_for(get_learning_context(second, principal, state["id"]), 5)
        assert one == two
