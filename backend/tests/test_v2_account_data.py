"""User export uses current teaching projection; account purge retains only remote intent."""

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import select

from app.models.teaching import ExamAnalysisRevision, TeachingAttempt, TeachingFeedback, TeachingItem, TeachingSession
from app.models.user import User
from app.models.v2_runtime import (
    AgentRun,
    AgentRunEvent,
    AgentStep,
    ExternalConnection,
    ExternalCredential,
    GatewayLifecycleIntent,
)
from app.services import account_data, v2_access
from app.services.teaching import service
from app.services.teaching.principal import Principal
from app.tasks.account_tasks import _prepare_v2_removal, _purge_user
from tests.teaching_fixtures import seed_original_content


async def _seed(db, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db)
    monkeypatch.setattr(
        v2_access, "get_settings", lambda: SimpleNamespace(teaching_enabled=True, teaching_allowed_user_ids=user.id)
    )
    state = await service.create_session(
        db, Principal(user.id), {"operation_id": "account-start", "content_revision_id": revision.id}
    )
    state = await service.submit_attempt(
        db,
        Principal(user.id),
        state["id"],
        {
            "operation_id": "account-answer",
            "expected_revision": state["revision"],
            "item_id": state["current_item_id"],
            "answer": "A",
        },
    )
    now = datetime.now(UTC)
    connection = ExternalConnection(
        user_id=user.id, host_label="Private host", granted_scopes=["teaching:read"], expires_at=now + timedelta(days=1)
    )
    run = AgentRun(
        user_id=user.id,
        session_id=state["id"],
        operation_id="account-run",
        request_hash="e" * 64,
        message="INTERNAL_USER_MESSAGE",
        status="running",
        bound_session_revision=state["revision"],
        queue_deadline_at=now + timedelta(minutes=1),
        lease_epoch=2,
    )
    db.add_all([connection, run])
    await db.flush()
    credential = ExternalCredential(connection_id=connection.id, token_hash="f" * 64)
    db.add_all(
        [
            credential,
            AgentStep(
                run_id=run.id,
                seq=1,
                kind="model",
                status="dispatched",
                lease_epoch=2,
                safe_result={"secret": "PRIVILEGED_STEP"},
            ),
            AgentRunEvent(
                run_id=run.id,
                sequence=1,
                type="card.upsert",
                session_revision=state["revision"],
                safe_payload={"secret": "PRIVILEGED_CARD"},
            ),
            TeachingFeedback(
                user_id=user.id,
                session_id=state["id"],
                operation_id="visible-feedback",
                content="My feedback",
                source_kind="user_ui",
                expires_at=now + timedelta(days=1),
            ),
            TeachingFeedback(
                user_id=user.id,
                session_id=state["id"],
                operation_id="expired-feedback",
                content="EXPIRED_FEEDBACK",
                source_kind="user_ui",
                expires_at=now - timedelta(days=1),
            ),
        ]
    )
    other = User(name="Other export owner")
    db.add(other)
    await db.flush()
    other_session = TeachingSession(user_id=other.id)
    db.add(other_session)
    await db.flush()
    db.add(
        TeachingFeedback(
            user_id=other.id,
            session_id=other_session.id,
            operation_id="other-feedback",
            content="OTHER_PRIVATE_FEEDBACK",
            source_kind="user_ui",
            expires_at=now + timedelta(days=1),
        )
    )
    await db.commit()
    return user, revision, state, connection, credential, run, other


async def test_v2_export_has_only_owned_projected_facts_and_safe_runtime_summary(db_session, monkeypatch):
    user, revision, state, connection, _credential, run, _other = await _seed(db_session, monkeypatch)
    data = await account_data.gather_user_data(db_session, user)
    assert {
        "teaching_sessions",
        "teaching_attempts",
        "question_disclosures",
        "teaching_feedbacks",
        "teaching_operations",
        "external_connections",
        "teaching_runs",
    }.issubset(account_data.EXPORT_ORDER)
    assert data["teaching_sessions"][0]["id"] == state["id"]
    assert data["teaching_attempts"][0]["answer"] == "A"
    assert [row["content"] for row in data["teaching_feedbacks"]] == ["My feedback"]
    assert data["external_connections"][0]["id"] == connection.id
    assert data["teaching_runs"][0]["id"] == run.id and data["teaching_runs"][0]["cards"] == []
    encoded = json.dumps(data)
    for hidden in (
        "token_hash",
        "request_hash",
        "verification_report",
        "INTERNAL_USER_MESSAGE",
        "PRIVILEGED_STEP",
        "PRIVILEGED_CARD",
        "EXPIRED_FEEDBACK",
        "OTHER_PRIVATE_FEEDBACK",
        "correct_answer",
    ):
        assert hidden not in encoded
    revision.rights_policy = {**revision.rights_policy, "site_display": False}
    await db_session.commit()
    restricted = await account_data.gather_user_data(db_session, user)
    assert restricted["teaching_attempts"] == []
    assert [card["kind"] for card in restricted["teaching_sessions"][0]["cards"]] == ["status"]
    assert revision.question_payload["passage"] not in json.dumps(restricted)


async def test_v2_purge_revokes_fences_and_deletes_private_children_but_keeps_gateway_intent(
    db_session, monkeypatch, tmp_path
):
    user, revision, state, connection, credential, run, other = await _seed(db_session, monkeypatch)
    uid, rid, other_id = user.id, revision.id, other.id
    monkeypatch.setattr(account_data, "_media_root", lambda: tmp_path)
    await _prepare_v2_removal(db_session, uid)
    await _prepare_v2_removal(db_session, uid)
    assert connection.revoked_at is not None and credential.revoked_at is not None
    assert run.status == "cancelled" and run.lease_epoch == 3 and run.cancel_requested_at is not None
    intents = (
        (await db_session.execute(select(GatewayLifecycleIntent).where(GatewayLifecycleIntent.subject_ref == uid)))
        .scalars()
        .all()
    )
    assert len(intents) == 1 and intents[0].status == "pending"
    await db_session.commit()
    await _purge_user(db_session, user)
    assert await db_session.get(User, uid) is None
    assert await db_session.get(User, other_id) is not None
    assert await db_session.get(ExamAnalysisRevision, rid) is not None
    for model in (ExternalCredential, AgentRun, AgentRunEvent, AgentStep, TeachingAttempt, TeachingItem):
        assert (await db_session.execute(select(model))).scalars().all() == []
    assert await db_session.get(TeachingSession, state["id"]) is None
    intents = (await db_session.execute(select(GatewayLifecycleIntent))).scalars().all()
    assert len(intents) == 1 and intents[0].subject_ref == uid and intents[0].status == "pending"


async def test_v2_removal_rolls_back_revocation_cancellation_and_remote_intent(db_session, monkeypatch):
    user, _revision, _state, connection, credential, run, _other = await _seed(db_session, monkeypatch)
    uid, cid, credential_id, run_id = user.id, connection.id, credential.id, run.id
    await _prepare_v2_removal(db_session, uid)
    await db_session.rollback()
    restored_connection = await db_session.get(ExternalConnection, cid)
    restored_credential = await db_session.get(ExternalCredential, credential_id)
    restored_run = await db_session.get(AgentRun, run_id)
    assert restored_connection.revoked_at is None and restored_credential.revoked_at is None
    assert restored_run.status == "running" and restored_run.lease_epoch == 2
    assert (await db_session.execute(select(GatewayLifecycleIntent))).scalars().all() == []
