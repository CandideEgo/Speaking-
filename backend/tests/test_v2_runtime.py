"""Cross-boundary credentials, durable execution and permission-projected replay."""

import hashlib
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models.v2_runtime import AgentRun, ExternalCredential
from app.services import external_connection_service as connections
from app.services import teaching_runs, v2_access
from app.services.teaching import service as core
from tests.teaching_fixtures import seed_original_content


def enable(monkeypatch, user_id):
    settings = SimpleNamespace(
        teaching_enabled=True,
        teaching_runs_enabled=True,
        mcp_read_enabled=True,
        mcp_write_enabled=True,
        teaching_allowed_user_ids=user_id,
    )
    monkeypatch.setattr(v2_access, "get_settings", lambda: settings)
    monkeypatch.setattr(teaching_runs, "require_gateway", lambda: None)
    return settings


async def start(db, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db)
    settings = enable(monkeypatch, user.id)
    principal = core.Principal(user.id)
    state = await core.create_session(db, principal, {"operation_id": "start", "content_revision_id": revision.id})
    await db.commit()
    return user, revision, state, principal, settings


async def test_credentials_rotated_and_revoked_without_storing_plaintext(db_session, monkeypatch):
    user, _revision, _state, _principal, _settings = await start(db_session, monkeypatch)
    issued = await connections.create(db_session, user.id, "Codex", ["teaching:read"])
    token, cid = issued["token"], issued["connection"]["id"]
    await db_session.commit()
    rows = list((await db_session.execute(select(ExternalCredential))).scalars())
    assert rows[0].token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in str(rows[0].__dict__)
    principal = await connections.authenticate(db_session, token)
    assert principal.actor == "external_agent" and principal.connection_id == cid
    rotated = await connections.rotate(db_session, user.id, cid)
    await db_session.commit()
    with pytest.raises(AppError, match="外部凭据"):
        await connections.authenticate(db_session, token)
    assert (await connections.authenticate(db_session, rotated["token"])).user_id == user.id
    await connections.revoke(db_session, user.id, cid)
    await db_session.commit()
    with pytest.raises(AppError) as exc:
        await connections.authenticate(db_session, rotated["token"], write=True)
    assert exc.value.code == "EXTERNAL_TOKEN_INVALID"


async def test_read_scope_cannot_submit_and_password_change_invalidates_token(db_session, monkeypatch):
    user, _revision, state, _principal, _settings = await start(db_session, monkeypatch)
    issued = await connections.create(db_session, user.id, "Claude", ["teaching:read"])
    await db_session.commit()
    principal = await connections.authenticate(db_session, issued["token"])
    with pytest.raises(AppError) as exc:
        await core.submit_attempt(
            db_session,
            principal,
            state["id"],
            {
                "operation_id": "external",
                "answer": "B",
                "expected_revision": state["revision"],
                "item_id": state["current_item_id"],
            },
        )
    assert exc.value.code == "INSUFFICIENT_SCOPE"
    user.password_changed_at = datetime.now(UTC) + timedelta(seconds=1)
    await db_session.commit()
    with pytest.raises(AppError) as exc:
        await connections.authenticate(db_session, issued["token"])
    assert exc.value.code == "EXTERNAL_TOKEN_INVALID"


async def test_run_receipt_cancel_replay_and_no_duplicate_execution(db_session, monkeypatch):
    _user, _revision, state, principal, settings = await start(db_session, monkeypatch)
    body = SimpleNamespace(operation_id="run-one", expected_revision=state["revision"], message="Explain the evidence")
    first = await teaching_runs.create(db_session, principal, state["id"], body)
    await db_session.commit()
    replay = await teaching_runs.create(db_session, principal, state["id"], body)
    assert replay == first
    changed = SimpleNamespace(**{**body.__dict__, "message": "different"})
    with pytest.raises(AppError) as exc:
        await teaching_runs.create(db_session, principal, state["id"], changed)
    assert exc.value.code == "IDEMPOTENCY_CONFLICT"
    result = await teaching_runs.cancel(db_session, principal, first["run_id"])
    await db_session.commit()
    assert result["status"] == "cancelled"
    settings.teaching_runs_enabled = False
    restored = await teaching_runs.get(db_session, principal, first["run_id"])
    assert restored["status"] == "cancelled"
    assert len((await db_session.execute(select(AgentRun))).scalars().all()) == 1


async def test_event_replay_intersects_current_rights_and_cursor_retention(db_session, monkeypatch):
    user, revision, state, principal, _settings = await start(db_session, monkeypatch)
    run = AgentRun(
        user_id=user.id,
        session_id=state["id"],
        operation_id="event-test",
        request_hash="a" * 64,
        bound_session_revision=state["revision"],
        queue_deadline_at=datetime.now(UTC),
        last_sequence=0,
        status="succeeded",
    )
    db_session.add(run)
    await db_session.flush()
    teaching_runs.append_event(db_session, run, "card.upsert", {"card_id": state["cards"][0]["card_id"]})
    await db_session.commit()
    rows, _status = await teaching_runs.events(db_session, principal, run.id, 0)
    assert rows[0]["type"] == "card.upsert"
    revision.status = "withdrawn"
    await db_session.commit()
    rows, _status = await teaching_runs.events(db_session, principal, run.id, 0)
    assert rows[0]["type"] == "content.restricted" and "passage" not in str(rows)
    run.created_at = datetime.now(UTC) - timedelta(hours=25)
    await db_session.commit()
    with pytest.raises(AppError) as exc:
        await teaching_runs.events(db_session, principal, run.id, 0)
    assert exc.value.code == "EVENT_CURSOR_EXPIRED"


async def test_run_dispatch_is_idempotent_and_has_no_model_write_authority(db_session, monkeypatch):
    _user, _revision, state, principal, _settings = await start(db_session, monkeypatch)
    from app.core import database
    from tests.conftest import TestSessionLocal

    monkeypatch.setattr(database, "get_async_session_maker", lambda: TestSessionLocal)
    body = SimpleNamespace(operation_id="worker-one", expected_revision=state["revision"], message="Give me the answer")
    result = await teaching_runs.create(db_session, principal, state["id"], body)
    await db_session.commit()
    await teaching_runs.execute(result["run_id"])
    await teaching_runs.execute(result["run_id"])
    db_session.expire_all()
    restored = await teaching_runs.get(db_session, principal, result["run_id"])
    assert restored["status"] == "succeeded"
    current = await core.get_session(db_session, principal, state["id"])
    assert current["attempts"] == [] and current["revision"] == state["revision"]
    assert restored["cards"][0]["kind"] == "status"
