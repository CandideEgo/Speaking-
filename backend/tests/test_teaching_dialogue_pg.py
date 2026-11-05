"""Conversation commits and late-response fencing under actual PG locks."""

import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.core.database import get_async_session_maker
from app.models.teaching import ExamAnalysisRevision
from app.models.v2_runtime import AgentRun, TeachingMessage
from app.schemas.teaching_dialogue import TutorReply
from app.services import teaching_runs, v2_access
from app.services.teaching import service as core
from tests.test_v2_runtime_pg import seed

pytestmark = pytest.mark.integration


async def prepare(monkeypatch):
    user_id, revision_id, state = await seed(monkeypatch, revealed=True)
    v2_access.get_settings().teaching_dialogue_enabled = True
    return user_id, revision_id, state


async def test_two_creators_share_one_run_and_one_user_message(monkeypatch):
    user_id, _revision, state = await prepare(monkeypatch)
    body = SimpleNamespace(operation_id="same-dialogue", expected_revision=state["revision"], message="Compare A and B")
    barrier = asyncio.Barrier(2)

    async def create():
        async with get_async_session_maker()() as db:
            await barrier.wait()
            result = await teaching_runs.create(
                db, core.Principal(user_id), state["id"], body, response_mode="conversation"
            )
            await db.commit()
            return result

    a, b = await asyncio.gather(create(), create())
    assert a["run_id"] == b["run_id"]
    async with get_async_session_maker()() as db:
        assert await db.scalar(select(func.count()).select_from(AgentRun)) == 1
        assert await db.scalar(select(func.count()).select_from(TeachingMessage)) == 1


@pytest.mark.parametrize("change", ["cancel", "epoch", "revision", "rights"])
async def test_obsolete_reply_never_appends_an_assistant_message(monkeypatch, change):
    user_id, revision_id, state = await prepare(monkeypatch)
    principal = core.Principal(user_id)
    async with get_async_session_maker()() as db:
        created = await teaching_runs.create(
            db,
            principal,
            state["id"],
            SimpleNamespace(
                operation_id="late-dialogue", expected_revision=state["revision"], message="Explain this evidence"
            ),
            response_mode="conversation",
        )
        await db.commit()
    ready, finish = asyncio.Event(), asyncio.Event()

    async def controlled(_user, _run, _logical, _message, _context, _deadline, *, before_dispatch):
        fresh = await before_dispatch()
        citation = next(c["card_id"] for c in fresh["learning_context"]["cards"] if c["kind"] == "analysis")
        ready.set()
        await finish.wait()
        return TutorReply(text="A is unsupported by the source.", citation_ids=[citation], source="model")

    monkeypatch.setattr(teaching_runs, "tutor_reply", controlled)
    worker = asyncio.create_task(teaching_runs.execute(created["run_id"]))
    await asyncio.wait_for(ready.wait(), 5)
    try:
        async with get_async_session_maker()() as db:
            if change == "cancel":
                await teaching_runs.cancel(db, principal, created["run_id"])
            elif change == "epoch":
                await core.owned_session(db, principal, state["id"], lock=True)
                row = await teaching_runs._owned(db, user_id, created["run_id"], lock=True)
                row.lease_epoch += 1
            elif change == "revision":
                await core.request_hint(
                    db,
                    principal,
                    state["id"],
                    {
                        "operation_id": "during-reply",
                        "expected_revision": state["revision"],
                        "item_id": state["current_item_id"],
                    },
                )
            else:
                row = await db.get(ExamAnalysisRevision, revision_id, with_for_update=True)
                row.rights_policy = {**row.rights_policy, "model_processing": False}
            await db.commit()
    finally:
        finish.set()
    await asyncio.wait_for(worker, 5)
    async with get_async_session_maker()() as db:
        rows = list((await db.execute(select(TeachingMessage))).scalars())
        assert len(rows) == 1 and rows[0].role == "user"
