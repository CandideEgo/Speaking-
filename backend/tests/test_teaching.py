"""V2 deterministic teaching, qualification, rights and replay regressions."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core.errors import AppError
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.question_exposure import UserQuestionExposure
from app.models.teaching import (
    ExamAnalysisRevision,
    LearningEventOutbox,
    TeachingAttempt,
    TeachingFeedback,
    TeachingItem,
)
from app.models.user import User
from app.schemas.teaching import CreateSession, SessionResponse, SubmitAttempt
from app.services import v2_access
from app.services.teaching import service
from app.services.teaching.content import current_revision_available, publish_revision, validate_candidate
from app.services.teaching.events import deliver_pending_events
from app.services.teaching.principal import Principal
from tests.teaching_fixtures import original_candidate, seed_original_content


def enable(monkeypatch, user_id):
    settings = SimpleNamespace(teaching_enabled=True, teaching_allowed_user_ids=user_id)
    monkeypatch.setattr(v2_access, "get_settings", lambda: settings)
    return settings


def action(state, operation_id, **extra):
    return {
        "operation_id": operation_id,
        "expected_revision": state["revision"],
        "item_id": state["current_item_id"],
        **extra,
    }


def test_automatic_gate_accepts_complete_original_evidence():
    result = validate_candidate(original_candidate())
    assert result["question_key"] == "exam:cet4:2025:12:1:46"
    assert len(result["source_fingerprint"]) == 64


@pytest.mark.parametrize(
    "change",
    ["one_model", "conflicting_answer", "missing_rights", "hint_leak", "bad_span", "placeholder", "wrong_slot"],
)
def test_automatic_gate_rejects_missing_or_conflicting_proof(change):
    candidate = original_candidate()
    if change == "one_model":
        candidate["verification_report"]["blind_answers"].pop()
    elif change == "conflicting_answer":
        candidate["verification_report"]["sources"][1]["answer"] = "C"
    elif change == "missing_rights":
        candidate["rights_policy"]["evidence_sha256"] = ""
    elif change == "hint_leak":
        candidate["reviewed_hints"] = ["答案是 B"]
    elif change == "bad_span":
        candidate["evidence"][0]["start"] += 1
    elif change == "placeholder":
        candidate["analysis_payload"] = {"summary": "这里是第46题的解析..."}
    else:
        candidate["verification_report"]["sources"][0]["question_payload"]["number"] = 47
    with pytest.raises(AppError) as error:
        validate_candidate(candidate)
    assert error.value.status_code == 422


def test_identity_and_score_cannot_come_from_request():
    with pytest.raises(ValidationError):
        CreateSession(operation_id="x", question_id="q", actor="user_ui")
    with pytest.raises(ValidationError):
        SubmitAttempt(operation_id="x", expected_revision=1, item_id="i", answer="B", correct=True)


async def test_initial_hint_retry_reveal_and_receipt_replay(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    principal = Principal(user.id)
    created = await service.create_session(
        db_session, principal, {"operation_id": "create", "content_revision_id": revision.id}
    )
    await db_session.commit()
    assert not any(c["kind"] == "analysis" for c in created["cards"])
    initial_body = action(created, "initial", answer=" a ")
    first = await service.submit_attempt(db_session, principal, created["id"], initial_body)
    await db_session.commit()
    assert first["attempts"][0]["role"] == "initial"
    assert first["attempts"][0]["correct"] is False
    assert "correct_answer" not in str(first)
    replay = await service.submit_attempt(db_session, principal, created["id"], initial_body)
    await db_session.commit()
    assert replay["replayed"] and replay["operation_result"] == first["operation_result"]
    assert len(replay["attempts"]) == 1
    hinted = await service.request_hint(db_session, principal, created["id"], action(first, "hint"))
    await db_session.commit()
    assert any(c["kind"] == "hint" for c in hinted["cards"])
    retried = await service.submit_attempt(db_session, principal, created["id"], action(hinted, "retry", answer="B"))
    await db_session.commit()
    assert retried["attempts"][-1]["role"] == "retry"
    assert retried["attempts"][-1]["assistance_snapshot"]["max_hint_level"] == 1
    assert not any(c["kind"] == "analysis" for c in retried["cards"])
    revealed = await service.reveal_answer(db_session, principal, created["id"], action(retried, "reveal"))
    await db_session.commit()
    assert next(c for c in revealed["cards"] if c["kind"] == "analysis")["payload"]["correct_answer"] == "B"
    SessionResponse.model_validate(revealed)
    exposure = await db_session.get(UserQuestionExposure, (user.id, revision.question_key))
    assert exposure.first_answer_available_at and exposure.feedback_count == 2
    assert await deliver_pending_events(db_session) == 2
    await db_session.commit()
    assert await deliver_pending_events(db_session) == 0
    assert await db_session.scalar(select(func.count()).select_from(LearningEvent)) == 2
    assert await db_session.scalar(select(func.count()).select_from(UserLearningProfile)) == 0


async def test_unknown_history_and_cross_session_help_never_reset_initial(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session, complete_history=False)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    first = await service.create_session(db_session, p, {"operation_id": "one", "content_revision_id": revision.id})
    await db_session.commit()
    result = await service.submit_attempt(db_session, p, first["id"], action(first, "answer", answer="A"))
    await db_session.commit()
    assert result["attempts"][0]["assistance_snapshot"]["initial_eligibility"] == "unknown"
    second = await service.create_session(db_session, p, {"operation_id": "two", "content_revision_id": revision.id})
    await db_session.commit()
    second = await service.submit_attempt(db_session, p, second["id"], action(second, "answer-two", answer="B"))
    await db_session.commit()
    assert second["attempts"][0]["role"] == "retry"
    assert second["attempts"][0]["assistance_snapshot"]["feedback_count"] == 1


async def test_revision_conflict_and_changed_operation_have_no_extra_attempt(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    created = await service.create_session(
        db_session, p, {"operation_id": "create", "content_revision_id": revision.id}
    )
    await db_session.commit()
    body = action(created, "answer", answer="A")
    await service.submit_attempt(db_session, p, created["id"], body)
    await db_session.commit()
    with pytest.raises(AppError, match="同一个操作") as conflict:
        await service.submit_attempt(db_session, p, created["id"], {**body, "answer": "C"})
    assert conflict.value.code == "IDEMPOTENCY_CONFLICT"
    await db_session.rollback()
    with pytest.raises(AppError) as stale:
        await service.submit_attempt(db_session, p, created["id"], {**body, "operation_id": "new"})
    assert stale.value.code == "TEACHING_REVISION_CONFLICT"
    await db_session.rollback()
    assert await db_session.scalar(select(func.count()).select_from(TeachingAttempt)) == 1
    assert await db_session.scalar(select(func.count()).select_from(LearningEventOutbox)) == 1


async def test_model_write_forbidden_and_external_read_does_not_leak_analysis(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    state = await service.create_session(db_session, p, {"operation_id": "create", "content_revision_id": revision.id})
    await db_session.commit()
    with pytest.raises(AppError) as forbidden:
        await service.submit_attempt(
            db_session, Principal(user.id, actor="internal_agent"), state["id"], action(state, "model", answer="B")
        )
    assert forbidden.value.status_code == 403
    answered = await service.submit_attempt(db_session, p, state["id"], action(state, "answer", answer="B"))
    await db_session.commit()
    revealed = await service.reveal_answer(db_session, p, state["id"], action(answered, "reveal"))
    await db_session.commit()
    external = Principal(
        user.id, actor="external_agent", connection_id="connection", granted_scopes=frozenset({"teaching:read"})
    )
    result = await service.get_session(db_session, external, state["id"])
    assert result["attempts"] == []
    assert all(c["kind"] not in {"analysis", "evidence"} for c in result["cards"])
    assert result["items"][0]["draft_answer"] is None
    assert revealed["revision"] == result["revision"]


async def test_rights_withdrawal_reprojects_old_receipts_and_disabled_reads_work(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    settings = enable(monkeypatch, user.id)
    p = Principal(user.id)
    state = await service.create_session(db_session, p, {"operation_id": "create", "content_revision_id": revision.id})
    await db_session.commit()
    body = action(state, "reveal")
    await service.reveal_answer(db_session, p, state["id"], body)
    await db_session.commit()
    revision.status = "withdrawn"
    await db_session.commit()
    replay = await service.reveal_answer(db_session, p, state["id"], body)
    await db_session.commit()
    assert replay["replayed"] and [c["kind"] for c in replay["cards"]] == ["status"]
    settings.teaching_enabled = False
    read = await service.get_session(db_session, p, state["id"])
    assert read["id"] == state["id"]
    with pytest.raises(AppError) as blocked:
        await service.create_session(db_session, p, {"operation_id": "new", "content_revision_id": revision.id})
    assert blocked.value.status_code == 503


async def test_source_changes_invalidate_new_sessions_but_keep_frozen_grading(db_session, monkeypatch):
    user, revision, question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    state = await service.create_session(db_session, p, {"operation_id": "create", "content_revision_id": revision.id})
    await db_session.commit()
    question.answer = "C"
    await db_session.commit()
    assert not await current_revision_available(db_session, revision)
    result = await service.submit_attempt(db_session, p, state["id"], action(state, "answer", answer="B"))
    await db_session.commit()
    assert result["attempts"][0]["correct"]
    with pytest.raises(AppError) as invalid:
        await service.create_session(db_session, p, {"operation_id": "new", "content_revision_id": revision.id})
    assert invalid.value.code == "CONTENT_REVISION_MISMATCH"


async def test_feedback_is_unverified_and_expires_without_changing_counters(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    state = await service.create_session(db_session, p, {"operation_id": "create", "content_revision_id": revision.id})
    await db_session.commit()
    await service.record_feedback(
        db_session, p, state["id"], action(state, "feedback", content="I find comparisons difficult.")
    )
    await db_session.commit()
    feedback = await db_session.scalar(select(TeachingFeedback))
    assert feedback.verification == "unverified"
    assert (feedback.expires_at - feedback.occurred_at).total_seconds() == pytest.approx(86400, abs=1)
    assert await db_session.scalar(select(func.count()).select_from(TeachingAttempt)) == 0
    assert await db_session.scalar(select(func.count()).select_from(UserLearningProfile)) == 0


async def test_other_user_get_and_forged_item_are_hidden(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    state = await service.create_session(db_session, p, {"operation_id": "create", "content_revision_id": revision.id})
    await db_session.commit()
    other = User(name="Another synthetic user")
    db_session.add(other)
    await db_session.commit()
    with pytest.raises(AppError) as hidden:
        await service.get_session(db_session, Principal(other.id), state["id"])
    assert hidden.value.status_code == 404
    with pytest.raises(AppError) as wrong_item:
        await service.submit_attempt(
            db_session, p, state["id"], {**action(state, "forged", answer="B"), "item_id": "not-this-item"}
        )
    assert wrong_item.value.status_code == 404


async def test_published_body_and_attempt_are_immutable(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    revision.correct_answer = "C"
    with pytest.raises(ValueError, match="immutable"):
        await db_session.flush()
    await db_session.rollback()


async def test_draft_is_not_graded_and_complete_is_durable(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    state = await service.create_session(db_session, p, {"operation_id": "create", "content_revision_id": revision.id})
    await db_session.commit()
    draft = await service.save_draft(db_session, p, state["id"], action(state, "draft", answer="C"))
    await db_session.commit()
    assert draft["items"][0]["draft_answer"] == "C" and draft["attempts"] == []
    completed = await service.complete_session(
        db_session,
        p,
        state["id"],
        {"operation_id": "complete", "expected_revision": draft["revision"], "action": "complete"},
    )
    await db_session.commit()
    assert completed["status"] == "completed"
    assert (await db_session.get(TeachingItem, state["current_item_id"])).draft_answer == "C"


async def test_publication_requires_authenticated_gateway_receipts(db_session):
    with pytest.raises(AppError) as blocked:
        await publish_revision(db_session, original_candidate())
    assert blocked.value.status_code == 503
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 0


async def test_http_contract_replay_and_unknown_fields(client, auth_headers, db_session, monkeypatch):
    user = await db_session.scalar(select(User).where(User.phone == "13800138000"))
    user, revision, question, _candidate = await seed_original_content(db_session, existing_user=user)
    enable(monkeypatch, user.id)
    catalog = await client.get(f"/api/v1/teaching/content?question_id={question.id}", headers=auth_headers)
    assert catalog.status_code == 200 and catalog.json()["items"][0]["id"] == revision.id
    body = {"operation_id": "http-create", "content_revision_id": revision.id}
    forged = await client.post("/api/v1/teaching/sessions", json={**body, "actor": "user_ui"}, headers=auth_headers)
    assert forged.status_code == 422
    created = await client.post("/api/v1/teaching/sessions", json=body, headers=auth_headers)
    assert created.status_code == 201
    state = SessionResponse.model_validate(created.json()).model_dump()
    replay = await client.post("/api/v1/teaching/sessions", json=body, headers=auth_headers)
    assert replay.status_code == 200 and replay.json()["id"] == state["id"]
    answer_body = action(state, "http-answer", answer="B")
    result = await client.post(
        f"/api/v1/teaching/sessions/{state['id']}/attempts", json=answer_body, headers=auth_headers
    )
    assert result.status_code == 201 and result.json()["attempts"][0]["correct"]
    assert all(card["kind"] != "analysis" for card in result.json()["cards"])
    again = await client.post(
        f"/api/v1/teaching/sessions/{state['id']}/attempts", json=answer_body, headers=auth_headers
    )
    assert again.status_code == 200 and again.json()["operation_result"] == result.json()["operation_result"]
    listing = await client.get("/api/v1/teaching/sessions", headers=auth_headers)
    assert listing.status_code == 200 and listing.json()["items"][0]["id"] == state["id"]


async def test_event_projection_failure_retries_without_losing_or_double_counting(db_session, monkeypatch):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    state = await service.create_session(db_session, p, {"operation_id": "create", "content_revision_id": revision.id})
    await db_session.commit()
    await service.submit_attempt(db_session, p, state["id"], action(state, "answer", answer="A"))
    await db_session.commit()
    original_execute = db_session.execute
    should_fail = True

    async def fail_once(statement, *args, **kwargs):
        nonlocal should_fail
        if should_fail and getattr(getattr(statement, "table", None), "name", "") == "learning_events":
            should_fail = False
            raise RuntimeError("injected projection outage")
        return await original_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", fail_once)
    assert await deliver_pending_events(db_session) == 0
    await db_session.commit()
    row = await db_session.scalar(select(LearningEventOutbox))
    assert row.status == "pending" and row.attempts == 1
    assert await db_session.scalar(select(func.count()).select_from(TeachingAttempt)) == 1
    assert await db_session.scalar(select(func.count()).select_from(LearningEvent)) == 0
    row.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    row.payload = {**row.payload, "event_date": "2020-12-31"}
    await db_session.commit()
    assert await deliver_pending_events(db_session) == 1
    await db_session.commit()
    event = await db_session.get(LearningEvent, row.event_id)
    assert event.event_date.isoformat() == "2020-12-31"
    row.status = "pending"
    await db_session.commit()
    assert await deliver_pending_events(db_session) == 1
    await db_session.commit()
    assert await db_session.scalar(select(func.count()).select_from(LearningEvent)) == 1
    assert await db_session.scalar(select(func.count()).select_from(UserLearningProfile)) == 0


async def test_invalid_outbox_goes_dead_and_preserves_attempt(db_session, monkeypatch, caplog):
    user, revision, _question, _candidate = await seed_original_content(db_session)
    enable(monkeypatch, user.id)
    p = Principal(user.id)
    state = await service.create_session(db_session, p, {"operation_id": "create", "content_revision_id": revision.id})
    await db_session.commit()
    await service.submit_attempt(db_session, p, state["id"], action(state, "answer", answer="A"))
    await db_session.commit()
    row = await db_session.scalar(select(LearningEventOutbox))
    row.payload = {}
    await db_session.commit()
    for _ in range(5):
        row.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        await db_session.commit()
        assert await deliver_pending_events(db_session) == 0
        await db_session.commit()
    assert row.status == "dead" and row.attempts == 5
    assert "teaching_event_delivery_dead" in caplog.text
    assert await db_session.scalar(select(func.count()).select_from(TeachingAttempt)) == 1


async def test_teaching_facts_do_not_become_overview_or_admin_active_days(db_session):
    from app.services.admin_stats import _compute_admin_stats
    from app.services.local_time import user_local_date
    from app.services.overview_service import build_overview

    user = User(name="Only auxiliary teaching")
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        LearningEvent(
            user_id=user.id,
            event_type="teaching_attempt",
            event_value=1,
            event_date=user_local_date(None),
            source="teaching",
            schema_version=3,
        )
    )
    await db_session.commit()
    overview = await build_overview(db_session, user)
    assert overview["learning"]["days_studied"] == 0
    assert overview["this_week"]["days_active"] == 0
    admin = await _compute_admin_stats(db_session)
    assert sum(admin["trend"]["active_users"]) == 0
    db_session.add(
        LearningEvent(user_id=user.id, event_type="learned_words", event_value=1, event_date=user_local_date(None))
    )
    await db_session.commit()
    overview = await build_overview(db_session, user)
    assert overview["learning"]["days_studied"] == 1
