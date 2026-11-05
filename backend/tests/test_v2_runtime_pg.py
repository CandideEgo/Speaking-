"""Real PG locks and late model responses across independent transactions.

Model calls are event-controlled test doubles. No provider, SDK transport or
paid model is contacted. PG_TEST_URL must name a disposable integration DB.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select, text

from app.core.database import get_async_session_maker
from app.core.errors import AppError
from app.models.teaching import ExamAnalysisRevision, TeachingAttempt, TeachingSession
from app.models.v2_runtime import AgentRun, AgentRunEvent, AgentStep, ExternalConnection, ExternalCredential
from app.services import external_connection_service as connections
from app.services import teaching_runs, v2_access
from app.services.teaching import service as core
from tests.teaching_fixtures import seed_original_content

pytestmark = pytest.mark.integration


async def seed(monkeypatch, *, revealed=False):
    async with get_async_session_maker()() as db:
        user, revision, _question, _candidate = await seed_original_content(db)
        user_id = user.id
        settings = SimpleNamespace(
            teaching_enabled=True,
            teaching_runs_enabled=True,
            mcp_read_enabled=True,
            mcp_write_enabled=True,
            teaching_allowed_user_ids=user_id,
        )
        monkeypatch.setattr(v2_access, "get_settings", lambda: settings)
        monkeypatch.setattr(teaching_runs, "require_gateway", lambda: None)
        principal = core.Principal(user_id)
        state = await core.create_session(db, principal, {"operation_id": "start", "content_revision_id": revision.id})
        await db.commit()
        if revealed:
            state = await core.reveal_answer(
                db,
                principal,
                state["id"],
                {"operation_id": "reveal", "expected_revision": state["revision"], "item_id": state["current_item_id"]},
            )
            await db.commit()
        return user_id, revision.id, state


async def issued(user_id):
    async with get_async_session_maker()() as db:
        result = await connections.create(
            db, user_id, "Original PG fixture", ["teaching:read", "teaching:attempts:submit"]
        )
        await db.commit()
        return result["connection"]["id"], result["token"]


async def wait_until_blocked(waiter_pid, blocker_pid):
    """Assert a real PG lock dependency instead of relying on a timed sleep."""
    deadline = asyncio.get_running_loop().time() + 3
    async with get_async_session_maker()() as observer:
        while asyncio.get_running_loop().time() < deadline:
            blockers = await observer.scalar(text("SELECT pg_blocking_pids(:waiter)"), {"waiter": waiter_pid})
            if blocker_pid in blockers:
                return
            await asyncio.sleep(0.02)
    pytest.fail(f"Expected database lock dependency {waiter_pid} -> {blocker_pid}")


async def test_revocation_waits_for_authorized_write_then_rejects_the_next_call(monkeypatch):
    user_id, _revision_id, state = await seed(monkeypatch)
    connection_id, token = await issued(user_id)
    writer_locked = asyncio.Event()
    finish_write = asyncio.Event()
    loop = asyncio.get_running_loop()
    writer_pid, revoke_pid = loop.create_future(), loop.create_future()

    async def write_tool():
        async with get_async_session_maker()() as db:
            principal = await connections.authenticate(db, token, write=True)
            writer_pid.set_result(await db.scalar(text("SELECT pg_backend_pid()")))
            writer_locked.set()
            await finish_write.wait()
            result = await core.submit_attempt(
                db,
                principal,
                state["id"],
                {
                    "operation_id": "authorized-write",
                    "expected_revision": state["revision"],
                    "item_id": state["current_item_id"],
                    "answer": "B",
                },
            )
            await db.commit()
            return result

    async def revoke_connection():
        async with get_async_session_maker()() as db:
            revoke_pid.set_result(await db.scalar(text("SELECT pg_backend_pid()")))
            result = await connections.revoke(db, user_id, connection_id)
            await db.commit()
            return result

    writer = asyncio.create_task(write_tool())
    await asyncio.wait_for(writer_locked.wait(), 5)
    revoker = asyncio.create_task(revoke_connection())
    try:
        await wait_until_blocked(await revoke_pid, await writer_pid)
        assert not revoker.done()
    finally:
        finish_write.set()
    write_result, revoked = await asyncio.gather(writer, revoker)
    assert write_result["attempts"][0]["answer_origin"] == "external_reported"
    assert revoked["revoked_at"] is not None
    async with get_async_session_maker()() as db:
        with pytest.raises(AppError) as rejected:
            await connections.authenticate(db, token, write=True)
        assert rejected.value.code == "EXTERNAL_TOKEN_INVALID"
        assert await db.scalar(select(func.count()).select_from(TeachingAttempt)) == 1


@pytest.mark.parametrize("change", ["revoke", "rotate"])
async def test_stale_connection_and_credential_are_refreshed_after_lock_wait(monkeypatch, change):
    user_id, _revision_id, _state = await seed(monkeypatch)
    connection_id, token = await issued(user_id)
    allow_commit = asyncio.Event()
    change_locked = asyncio.Event()
    loop = asyncio.get_running_loop()
    changing_pid, reading_pid = loop.create_future(), loop.create_future()

    async def change_connection():
        async with get_async_session_maker()() as db:
            changing_pid.set_result(await db.scalar(text("SELECT pg_backend_pid()")))
            if change == "revoke":
                await connections.revoke(db, user_id, connection_id)
            else:
                await connections.rotate(db, user_id, connection_id)
            await db.flush()
            change_locked.set()
            await allow_commit.wait()
            await db.commit()

    async with get_async_session_maker()() as stale_db:
        # Keep strong references so SQLAlchemy's weak identity map retains the
        # deliberately stale rows while the revoker/rotator commits elsewhere.
        cached_connection = await stale_db.get(ExternalConnection, connection_id)
        cached_credential = await stale_db.scalar(
            select(ExternalCredential).where(ExternalCredential.connection_id == connection_id)
        )
        assert cached_connection.revoked_at is None and cached_credential.revoked_at is None
        changer = asyncio.create_task(change_connection())
        await asyncio.wait_for(change_locked.wait(), 5)

        async def authenticate_stale():
            reading_pid.set_result(await stale_db.scalar(text("SELECT pg_backend_pid()")))
            try:
                await connections.authenticate(stale_db, token, write=True)
                return "accepted"
            except AppError as exc:
                return exc.code

        reader = asyncio.create_task(authenticate_stale())
        try:
            await wait_until_blocked(await reading_pid, await changing_pid)
        finally:
            allow_commit.set()
        await changer
        assert await reader == "EXTERNAL_TOKEN_INVALID"
        await stale_db.rollback()


@pytest.mark.parametrize("same_session", [True, False])
async def test_concurrent_run_operation_has_one_receipt_across_sessions(monkeypatch, same_session):
    user_id, revision_id, first = await seed(monkeypatch)
    async with get_async_session_maker()() as db:
        second = (
            first
            if same_session
            else await core.create_session(
                db, core.Principal(user_id), {"operation_id": "second-session", "content_revision_id": revision_id}
            )
        )
        await db.commit()
    barrier = asyncio.Barrier(2)

    async def create_run(state):
        async with get_async_session_maker()() as db:
            cached = await db.get(TeachingSession, state["id"])
            assert cached.revision == state["revision"]
            await barrier.wait()
            try:
                result = await teaching_runs.create(
                    db,
                    core.Principal(user_id),
                    state["id"],
                    SimpleNamespace(
                        operation_id="same-run-operation",
                        expected_revision=state["revision"],
                        message="Explain this source",
                    ),
                )
                await db.commit()
                return result
            except AppError as exc:
                await db.rollback()
                return exc.code

    results = await asyncio.gather(create_run(first), create_run(second))
    successes = [result for result in results if isinstance(result, dict)]
    if same_session:
        assert len(successes) == 2 and successes[0]["run_id"] == successes[1]["run_id"]
    else:
        assert len(successes) == 1 and "IDEMPOTENCY_CONFLICT" in results
    async with get_async_session_maker()() as db:
        assert await db.scalar(select(func.count()).select_from(AgentRun)) == 1


@pytest.mark.parametrize("change", ["cancel", "epoch", "session_revision", "model_rights"])
async def test_late_model_response_cannot_publish_under_obsolete_authority(monkeypatch, change):
    user_id, revision_id, state = await seed(monkeypatch, revealed=True)
    principal = core.Principal(user_id)
    async with get_async_session_maker()() as db:
        result = await teaching_runs.create(
            db,
            principal,
            state["id"],
            SimpleNamespace(
                operation_id="model-run", expected_revision=state["revision"], message="Explain the evidence"
            ),
        )
        await db.commit()
    run_id = result["run_id"]
    dispatched = asyncio.Event()
    finish_model = asyncio.Event()
    calls = []

    async def controlled_model(_user, _run, _logical, _message, _context, _deadline, *, before_dispatch):
        fresh = await before_dispatch()
        assert any(card["kind"] == "analysis" for card in fresh["cards"])
        calls.append("dispatched")
        dispatched.set()
        await finish_model.wait()
        return "show_analysis"

    monkeypatch.setattr(teaching_runs, "choose_intent", controlled_model)
    worker = asyncio.create_task(teaching_runs.execute(run_id))
    await asyncio.wait_for(dispatched.wait(), 5)
    try:
        async with get_async_session_maker()() as db:
            if change == "cancel":
                await teaching_runs.cancel(db, principal, run_id)
            elif change == "epoch":
                await core.owned_session(db, principal, state["id"], lock=True)
                run = await teaching_runs._owned(db, user_id, run_id, lock=True)
                run.lease_epoch += 1
                run.lease_expires_at = datetime.now(UTC) + timedelta(seconds=30)
            elif change == "session_revision":
                await core.request_hint(
                    db,
                    principal,
                    state["id"],
                    {
                        "operation_id": "during-model-hint",
                        "expected_revision": state["revision"],
                        "item_id": state["current_item_id"],
                    },
                )
            else:
                revision = await db.get(ExamAnalysisRevision, revision_id, with_for_update=True)
                revision.rights_policy = {**revision.rights_policy, "model_processing": False}
            await db.commit()
    finally:
        finish_model.set()
    await asyncio.wait_for(worker, 5)
    assert calls == ["dispatched"]
    async with get_async_session_maker()() as db:
        run = await db.get(AgentRun, run_id)
        events = list((await db.execute(select(AgentRunEvent).where(AgentRunEvent.run_id == run_id))).scalars())
        assert not any(event.type == "card.upsert" for event in events)
        assert not any(event.type == "run.completed" for event in events)
        if change == "cancel":
            assert run.status == "cancelled"
        elif change == "epoch":
            assert run.status == "running" and run.lease_epoch == 2
        else:
            assert run.status == "needs_retry"
            assert run.error_code == (
                "TEACHING_CONTEXT_CHANGED" if change == "session_revision" else "CONTENT_RESTRICTED"
            )
        assert await db.scalar(select(func.count()).select_from(TeachingAttempt)) == 0
        assert await db.scalar(select(func.count()).select_from(AgentStep)) == 1


async def test_model_rights_revoked_during_key_setup_prevent_dispatch(monkeypatch):
    user_id, revision_id, state = await seed(monkeypatch, revealed=True)
    async with get_async_session_maker()() as db:
        result = await teaching_runs.create(
            db,
            core.Principal(user_id),
            state["id"],
            SimpleNamespace(
                operation_id="pre-dispatch", expected_revision=state["revision"], message="Explain the evidence"
            ),
        )
        await db.commit()
    key_ready, continue_dispatch = asyncio.Event(), asyncio.Event()
    calls = []

    async def simulated_key_setup(_user, _run, _logical, _message, _context, _deadline, *, before_dispatch):
        key_ready.set()
        await continue_dispatch.wait()
        await before_dispatch()
        calls.append("model-dispatched")
        return "show_analysis"

    monkeypatch.setattr(teaching_runs, "choose_intent", simulated_key_setup)
    worker = asyncio.create_task(teaching_runs.execute(result["run_id"]))
    await asyncio.wait_for(key_ready.wait(), 5)
    try:
        async with get_async_session_maker()() as db:
            revision = await db.get(ExamAnalysisRevision, revision_id, with_for_update=True)
            revision.rights_policy = {**revision.rights_policy, "model_processing": False}
            await db.commit()
    finally:
        continue_dispatch.set()
    await asyncio.wait_for(worker, 5)
    assert calls == []
    async with get_async_session_maker()() as db:
        run = await db.get(AgentRun, result["run_id"])
        assert run.status == "needs_retry" and run.error_code == "CONTENT_RESTRICTED"
