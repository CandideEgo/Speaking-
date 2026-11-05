"""V2 task context: one core, explicit audience, bounded history and safe recovery.

Materials are original synthetic fixtures, not licensed/verified real exam proof.
"""

import json
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import func, select

from app.core.errors import AppError
from app.models.teaching import LearningEventOutbox, TeachingAttempt, TeachingOperation
from app.models.user import User
from app.schemas.learning_context import LearningContext
from app.services import teaching_runs
from app.services.teaching import service as core
from app.services.teaching.context import get_learning_context
from app.services.teaching.principal import Principal
from tests.conftest import TestSessionLocal
from tests.teaching_fixtures import seed_original_content
from tests.test_teaching import action
from tests.test_v2_runtime import enable


async def start(db, monkeypatch, *, existing_user=None):
    user, revision, question, candidate = await seed_original_content(db, existing_user=existing_user)
    settings = enable(monkeypatch, user.id)
    principal = Principal(user.id)
    state = await core.create_session(db, principal, {"operation_id": "start", "content_revision_id": revision.id})
    await db.commit()
    return user, revision, state, principal, settings, question, candidate


async def test_http_learning_journey_recovers_draft_help_and_frozen_material(
    client, auth_headers, db_session, monkeypatch
):
    user = await db_session.scalar(select(User).where(User.phone == "13800138000"))
    _, revision, state, _, _, _, candidate = await start(db_session, monkeypatch, existing_user=user)
    url = f"/api/v1/teaching/sessions/{state['id']}/context"
    initial = await client.get(url, headers=auth_headers)
    assert initial.status_code == 200 and initial.headers["cache-control"] == "no-store"
    context = LearningContext.model_validate(initial.json())
    assert context.task.state_version == 1 and context.audience == "site"
    assert context.material.content_revision_id == revision.id
    assert "correct_answer" not in initial.text and candidate["reviewed_hints"][0] not in initial.text
    assert set(context.allowed_actions) == {
        "save_draft",
        "submit_attempt",
        "request_hint",
        "reveal_answer",
        "record_feedback",
        "complete_session",
    }
    assert (await client.get(url)).status_code == 401
    # A caller cannot select a more privileged principal/audience through a query.
    assert (await client.get(url + "?audience=model", headers=auth_headers)).json()["audience"] == "site"
    draft = await client.put(
        f"/api/v1/teaching/sessions/{state['id']}/draft", headers=auth_headers, json=action(state, "draft", answer="A")
    )
    assert draft.status_code == 200
    state = draft.json()
    restored = (await client.get(url, headers=auth_headers)).json()
    assert restored["progress"]["draft_answer"] == "A" and restored["progress"]["attempt_count"] == 0
    for route, operation, extra in (
        ("attempts", "first", {"answer": "A"}),
        ("hints", "hint", {}),
        ("attempts", "retry", {"answer": "B"}),
        ("reveal", "reveal", {}),
    ):
        response = await client.post(
            f"/api/v1/teaching/sessions/{state['id']}/{route}",
            headers=auth_headers,
            json=action(state, operation, **extra),
        )
        assert response.status_code in (200, 201), response.text
        state = response.json()
    # A fresh DB session and a fresh HTTP read recover the same authoritative state.
    async with TestSessionLocal() as db:
        saved = await get_learning_context(db, Principal(user.id), state["id"])
    final = LearningContext.model_validate((await client.get(url, headers=auth_headers)).json())
    assert final == saved
    assert final.progress.draft_answer is None and final.progress.attempt_count == 2
    assert [a.role for a in final.progress.recent_attempts] == ["initial", "retry"]
    assert final.progress.help.hint_level == 1 and final.progress.help.max_hint_level == 1
    assert final.progress.help.analysis_revealed and final.progress.help.answer_available
    assert final.progress.recent_attempts[1].assistance_snapshot["max_hint_level"] == 1
    assert any(c.kind == "analysis" for c in final.cards)
    params = parse_qs(urlsplit(final.resume_url).query)
    assert params["teaching_session_id"] == [state["id"]] and params["item"] == [state["current_item_id"]]
    assert not any(key in final.model_dump() for key in ("user_id", "phone", "token", "verification_report"))
    assert final.material.source_fingerprint == revision.source_fingerprint


async def test_readonly_external_context_never_infers_answer_from_prior_success(db_session, monkeypatch):
    _, _, state, principal, _, _, _ = await start(db_session, monkeypatch)
    state = await core.submit_attempt(db_session, principal, state["id"], action(state, "correct", answer="B"))
    state = await core.reveal_answer(db_session, principal, state["id"], action(state, "reveal"))
    state = await core.save_draft(db_session, principal, state["id"], action(state, "draft", answer="B"))
    await db_session.commit()
    external = Principal(
        principal.user_id,
        actor="external_agent",
        connection_id="read-only",
        granted_scopes=frozenset({"teaching:read"}),
    )
    context = await get_learning_context(db_session, external, state["id"])
    assert context.audience == "external" and not context.progress.answers_visible
    assert context.progress.recent_attempts == [] and context.progress.draft_answer is None
    assert context.progress.help.analysis_revealed and context.allowed_actions == []
    assert "correct_answer" not in context.model_dump_json()
    assert all(card.kind not in {"analysis", "evidence"} for card in context.cards)


async def test_external_actions_intersect_scopes_and_runtime_flags(db_session, monkeypatch):
    _, _, state, principal, settings, _, _ = await start(db_session, monkeypatch)
    external = Principal(
        principal.user_id,
        actor="external_agent",
        connection_id="write",
        granted_scopes=frozenset({"teaching:read", "teaching:attempts:submit", "teaching:analysis:reveal"}),
    )
    context = await get_learning_context(db_session, external, state["id"])
    assert context.allowed_actions == ["submit_attempt"]  # reveal also requires analysis:read
    settings.mcp_write_enabled = False
    assert (await get_learning_context(db_session, external, state["id"])).allowed_actions == []
    settings.teaching_enabled = False
    restored = await get_learning_context(db_session, principal, state["id"])
    assert restored.allowed_actions == [] and not restored.material.restricted


@pytest.mark.parametrize(
    "permission,actor",
    [
        ("model_processing", "internal_agent"),
        ("external_redistribution", "external_agent"),
        ("site_display", "user_ui"),
    ],
)
async def test_context_applies_current_rights_before_sharing_any_material(db_session, monkeypatch, permission, actor):
    _, revision, state, principal, _, _, candidate = await start(db_session, monkeypatch)
    state = await core.submit_attempt(db_session, principal, state["id"], action(state, "answer", answer="B"))
    state = await core.reveal_answer(db_session, principal, state["id"], action(state, "reveal"))
    revision.rights_policy = {**revision.rights_policy, permission: False}
    await db_session.commit()
    reader = Principal(
        principal.user_id,
        actor=actor,
        connection_id="connection",
        granted_scopes=frozenset({"teaching:read", "teaching:analysis:read"}),
    )
    context = await get_learning_context(db_session, reader, state["id"])
    assert context.material.restricted and context.allowed_actions == []
    assert not context.progress.answers_visible and not context.progress.recent_attempts
    assert candidate["question_payload"]["passage"] not in context.model_dump_json()
    assert "correct_answer" not in context.model_dump_json()


async def test_context_is_bounded_readonly_and_pins_content_not_current_question(db_session, monkeypatch):
    _, revision, state, principal, _, question, candidate = await start(db_session, monkeypatch)
    for index in range(7):
        state = await core.submit_attempt(
            db_session, principal, state["id"], action(state, f"answer-{index}", answer="A")
        )
    await db_session.commit()
    counts = [
        await db_session.scalar(select(func.count()).select_from(model))
        for model in (TeachingOperation, TeachingAttempt, LearningEventOutbox)
    ]
    question.question = "Changed live question must not replace the frozen task."
    await db_session.commit()
    context = await get_learning_context(db_session, principal, state["id"])
    assert context.progress.attempt_count == 7 and context.progress.attempts_truncated
    assert [a.attempt_no for a in context.progress.recent_attempts] == [3, 4, 5, 6, 7]
    assert context.cards[0].payload.question == candidate["question_payload"]["question"]
    assert context.material.content_revision_id == revision.id
    after = [
        await db_session.scalar(select(func.count()).select_from(model))
        for model in (TeachingOperation, TeachingAttempt, LearningEventOutbox)
    ]
    assert after == counts
    model_context = await get_learning_context(
        db_session, Principal(principal.user_id, actor="internal_agent"), state["id"]
    )
    assert model_context.audience == "model" and model_context.allowed_actions == []


async def test_context_cannot_read_another_user_task(db_session, monkeypatch):
    _, _, state, _, _, _, _ = await start(db_session, monkeypatch)
    for session_id in (state["id"], "missing"):
        with pytest.raises(AppError) as exc:
            await get_learning_context(db_session, Principal("other-user"), session_id)
        assert exc.value.status_code == 404


async def test_completed_task_has_no_actions_and_keeps_drafts_isolated(db_session, monkeypatch):
    _, revision, state, principal, _, _, _ = await start(db_session, monkeypatch)
    other = await core.create_session(
        db_session, principal, {"operation_id": "another-task", "content_revision_id": revision.id}
    )
    other = await core.save_draft(db_session, principal, other["id"], action(other, "other-draft", answer="D"))
    state = await core.complete_session(
        db_session,
        principal,
        state["id"],
        {"operation_id": "complete", "expected_revision": state["revision"], "action": "complete"},
    )
    await db_session.commit()
    completed = await get_learning_context(db_session, principal, state["id"])
    active = await get_learning_context(db_session, principal, other["id"])
    assert completed.allowed_actions == [] and completed.task.status == "completed"
    assert completed.progress.draft_answer is None and active.progress.draft_answer == "D"
    assert completed.task.item_id != active.task.item_id


async def test_old_context_does_not_authorize_writes_after_content_withdrawal(db_session, monkeypatch):
    _, revision, state, principal, _, _, _ = await start(db_session, monkeypatch)
    before = await get_learning_context(db_session, principal, state["id"])
    assert "submit_attempt" in before.allowed_actions
    revision.status = "withdrawn"
    await db_session.commit()
    with pytest.raises(AppError) as exc:
        await core.submit_attempt(db_session, principal, state["id"], action(state, "stale-context", answer="B"))
    assert exc.value.code == "CONTENT_REVISION_MISMATCH"
    await db_session.rollback()
    assert await db_session.scalar(select(func.count()).select_from(TeachingAttempt)) == 0
    assert (await get_learning_context(db_session, principal, state["id"])).material.restricted


async def test_runtime_dispatch_receives_the_shared_model_context(db_session, monkeypatch):
    _, _, state, principal, _, _, _ = await start(db_session, monkeypatch)
    from app.core import database

    monkeypatch.setattr(database, "get_async_session_maker", lambda: TestSessionLocal)
    state = await core.reveal_answer(db_session, principal, state["id"], action(state, "reveal"))
    body = SimpleNamespace(operation_id="explain", expected_revision=state["revision"], message="Explain the evidence")
    run = await teaching_runs.create(db_session, principal, state["id"], body)
    await db_session.commit()
    received = []

    async def choose(_user, _run, _call, _message, context, _deadline, *, before_dispatch):
        fresh = await before_dispatch()
        assert fresh == context
        checked = LearningContext.model_validate(fresh)
        assert checked.audience == "model" and checked.allowed_actions == []
        assert checked.task.state_version == state["revision"]
        assert "user_id" not in json.dumps(fresh) and checked.material.kind == "exam_question"
        received.append(checked)
        return "show_evidence"

    monkeypatch.setattr(teaching_runs, "choose_intent", choose)
    await teaching_runs.execute(run["run_id"])
    assert len(received) == 1
