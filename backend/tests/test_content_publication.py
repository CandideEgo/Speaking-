"""Admin publication workflow with original synthetic material and fake receipts.

These tests verify trust boundaries; they do not qualify real exam content.
"""

import copy
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content_publication import ContentPublicationOperation, TeachingContentDraft
from app.models.teaching import ExamAnalysisRevision, TeachingAttempt
from app.services.teaching import publication
from app.services.teaching import service as core
from app.services.teaching.context import get_learning_context
from app.services.teaching.principal import Principal
from tests.teaching_fixtures import seed_original_content
from tests.test_teaching import action, enable

PREFIX = "/api/v1/admin/teaching-content"


async def candidate(db, monkeypatch):
    user, revision, _, manifest = await seed_original_content(db)
    enable(monkeypatch, user.id)
    return user, revision, copy.deepcopy(manifest)


async def draft(client, headers, manifest, operation="create"):
    response = await client.post(
        f"{PREFIX}/drafts", headers=headers, json={"operation_id": operation, "manifest": manifest}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_admin_boundary_and_unverified_draft_is_not_publication(
    client, auth_headers, admin_headers, db_session, monkeypatch
):
    _, _, manifest = await candidate(db_session, monkeypatch)
    assert (await client.get(f"{PREFIX}/drafts")).status_code == 401
    assert (await client.get(f"{PREFIX}/drafts", headers=auth_headers)).status_code == 403
    state = await draft(client, admin_headers, {"question_id": manifest["question_id"]})
    assert state["publication_status"] == "draft" and state["published_revision_id"] is None
    preflight = await client.get(f"{PREFIX}/drafts/{state['id']}/preflight", headers=admin_headers)
    assert preflight.status_code == 200 and preflight.json()["structural_checks"] == "failed"
    assert preflight.json()["receipt_authentication"] == "not_checked"
    response = await client.post(
        f"{PREFIX}/drafts/{state['id']}/publish",
        headers=admin_headers,
        json={"operation_id": "bad", "expected_version": 1},
    )
    assert response.status_code == 422
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 1
    assert await db_session.scalar(select(func.count()).select_from(ContentPublicationOperation)) == 1


async def test_edit_conflict_replay_and_list_do_not_return_full_manifest(
    client, admin_headers, db_session, monkeypatch
):
    _, _, manifest = await candidate(db_session, monkeypatch)
    state = await draft(client, admin_headers, manifest)
    replay = await client.post(
        f"{PREFIX}/drafts", headers=admin_headers, json={"operation_id": "create", "manifest": manifest}
    )
    assert replay.status_code == 200 and replay.json()["id"] == state["id"]
    assert replay.json()["replayed"]
    response = await client.put(
        f"{PREFIX}/drafts/{state['id']}",
        headers=admin_headers,
        json={"operation_id": "edit", "expected_version": 1, "manifest": {}},
    )
    assert response.status_code == 200 and response.json()["version"] == 2
    stale = await client.put(
        f"{PREFIX}/drafts/{state['id']}",
        headers=admin_headers,
        json={"operation_id": "stale", "expected_version": 1, "manifest": manifest},
    )
    assert stale.status_code == 409
    conflict = await client.post(
        f"{PREFIX}/drafts", headers=admin_headers, json={"operation_id": "create", "manifest": {}}
    )
    assert conflict.status_code == 409 and conflict.json()["code"] == "IDEMPOTENCY_CONFLICT"
    listing = await client.get(f"{PREFIX}/drafts?page_size=1", headers=admin_headers)
    assert listing.status_code == 200 and listing.json()["total"] == 1
    assert "manifest" not in listing.json()["items"][0]
    detail = await client.get(f"{PREFIX}/drafts/{state['id']}", headers=admin_headers)
    assert detail.headers["cache-control"] == "no-store" and detail.json()["manifest"] == {}
    audit = await client.get(f"{PREFIX}/operations?target_id={state['id']}", headers=admin_headers)
    assert audit.status_code == 200 and audit.json()["total"] == 2
    assert {row["action"] for row in audit.json()["items"]} == {"create", "update"}


async def test_publication_stays_closed_without_server_receipt_verifier(client, admin_headers, db_session, monkeypatch):
    _, _, manifest = await candidate(db_session, monkeypatch)
    state = await draft(client, admin_headers, manifest)
    check = (await client.get(f"{PREFIX}/drafts/{state['id']}/preflight", headers=admin_headers)).json()
    assert check["structural_checks"] == "passed" and check["source_check"] == "matched"
    assert not check["verifier_available"] and check["receipt_authentication"] == "not_checked"
    response = await client.post(
        f"{PREFIX}/drafts/{state['id']}/publish",
        headers=admin_headers,
        json={"operation_id": "publish", "expected_version": 1},
    )
    assert response.status_code == 503
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 1
    row = await db_session.get(TeachingContentDraft, state["id"], populate_existing=True)
    assert row.version == 1 and row.published_revision_id is None


async def test_publication_replay_then_withdrawal_preserves_attempt_and_restricts_context(
    client, admin_headers, db_session, monkeypatch
):
    user, original, manifest = await candidate(db_session, monkeypatch)
    state = await draft(client, admin_headers, manifest)
    verifier = AsyncMock(return_value=True)
    monkeypatch.setattr(publication, "receipt_verifier", lambda: verifier)
    body = {"operation_id": "publish", "expected_version": 1}
    response = await client.post(f"{PREFIX}/drafts/{state['id']}/publish", headers=admin_headers, json=body)
    assert response.status_code == 200, response.text
    released = response.json()
    assert released["publication_status"] == "auto_verified" and released["version"] == 2
    assert verifier.await_count == 4
    revision_id = released["published_revision_id"]
    assert revision_id != original.id
    replay = await client.post(f"{PREFIX}/drafts/{state['id']}/publish", headers=admin_headers, json=body)
    assert replay.status_code == 200 and replay.json()["replayed"]
    assert replay.json()["published_revision_id"] == revision_id and verifier.await_count == 4
    denied_edit = await client.put(
        f"{PREFIX}/drafts/{state['id']}",
        headers=admin_headers,
        json={"operation_id": "edit-released", "expected_version": 2, "manifest": manifest},
    )
    assert denied_edit.status_code == 409
    learner = Principal(user.id)
    task = await core.create_session(db_session, learner, {"operation_id": "task", "content_revision_id": revision_id})
    task = await core.submit_attempt(db_session, learner, task["id"], action(task, "answer", answer="B"))
    await db_session.commit()
    withdrawal = {
        "operation_id": "withdraw",
        "expected_status": "auto_verified",
        "reason": "Source requires rechecking",
    }
    response = await client.post(f"{PREFIX}/revisions/{revision_id}/withdraw", headers=admin_headers, json=withdrawal)
    assert response.status_code == 200 and response.json()["status"] == "withdrawn"
    again = await client.post(f"{PREFIX}/revisions/{revision_id}/withdraw", headers=admin_headers, json=withdrawal)
    assert again.json()["replayed"]
    context = await get_learning_context(db_session, learner, task["id"])
    assert context.material.restricted and context.allowed_actions == []
    attempts = list((await db_session.execute(select(TeachingAttempt))).scalars())
    assert len(attempts) == 1 and attempts[0].correct
    audit = (await client.get(f"{PREFIX}/operations?target_id={revision_id}", headers=admin_headers)).json()
    assert audit["total"] == 1 and audit["items"][0]["reason"] == withdrawal["reason"]
    detail = (await client.get(f"{PREFIX}/drafts/{state['id']}", headers=admin_headers)).json()
    assert detail["publication_status"] == "withdrawn"
    # Replaying publish cannot resurrect the withdrawn revision.
    replay = await client.post(f"{PREFIX}/drafts/{state['id']}/publish", headers=admin_headers, json=body)
    assert replay.json()["publication_status"] == "withdrawn"


@pytest.mark.parametrize("receipt_result", [False, "true"])
async def test_invalid_receipts_cannot_create_a_revision(
    client, admin_headers, db_session, monkeypatch, receipt_result
):
    _, _, manifest = await candidate(db_session, monkeypatch)
    state = await draft(client, admin_headers, manifest)
    monkeypatch.setattr(publication, "receipt_verifier", lambda: AsyncMock(return_value=receipt_result))
    response = await client.post(
        f"{PREFIX}/drafts/{state['id']}/publish",
        headers=admin_headers,
        json={"operation_id": "publish", "expected_version": 1},
    )
    assert response.status_code == 422
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 1


@pytest.mark.parametrize(
    "manifest",
    [
        {"question_payload": []},
        {"verification_report": 1},
        {"question_id": {"id": 1}},
        {"question_payload": {"options": ["A"]}},
    ],
)
async def test_malformed_draft_preflight_fails_safely(client, admin_headers, manifest):
    state = await draft(client, admin_headers, manifest)
    response = await client.get(f"{PREFIX}/drafts/{state['id']}/preflight", headers=admin_headers)
    assert response.status_code == 200 and response.json()["structural_checks"] == "failed"


async def test_forged_actor_and_oversized_manifests_are_rejected(client, admin_headers):
    forged = await client.post(
        f"{PREFIX}/drafts",
        headers=admin_headers,
        json={"operation_id": "forged", "actor_id": "someone", "manifest": {}},
    )
    assert forged.status_code == 422
    large = await client.post(
        f"{PREFIX}/drafts", headers=admin_headers, json={"operation_id": "large", "manifest": {"text": "x" * 131072}}
    )
    assert large.status_code == 422


async def test_failed_commit_rolls_back_revision_and_receipt_then_retry_succeeds(
    client, admin_headers, db_session, monkeypatch
):
    _, _, manifest = await candidate(db_session, monkeypatch)
    state = await draft(client, admin_headers, manifest)
    monkeypatch.setattr(publication, "receipt_verifier", lambda: AsyncMock(return_value=True))
    original_commit = AsyncSession.commit

    async def fail(_db):
        raise RuntimeError("publication commit failed")

    body = {"operation_id": "publish", "expected_version": 1}
    monkeypatch.setattr(AsyncSession, "commit", fail)
    with pytest.raises(RuntimeError, match="publication commit failed"):
        await client.post(f"{PREFIX}/drafts/{state['id']}/publish", headers=admin_headers, json=body)
    monkeypatch.setattr(AsyncSession, "commit", original_commit)
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 1
    assert await db_session.scalar(select(func.count()).select_from(ContentPublicationOperation)) == 1
    response = await client.post(f"{PREFIX}/drafts/{state['id']}/publish", headers=admin_headers, json=body)
    assert response.status_code == 200 and not response.json()["replayed"]
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 2


async def test_verifier_failure_is_unavailable_and_never_creates_content(
    client, admin_headers, db_session, monkeypatch
):
    _, _, manifest = await candidate(db_session, monkeypatch)
    state = await draft(client, admin_headers, manifest)
    monkeypatch.setattr(publication, "receipt_verifier", lambda: AsyncMock(side_effect=OSError("lookup unavailable")))
    response = await client.post(
        f"{PREFIX}/drafts/{state['id']}/publish",
        headers=admin_headers,
        json={"operation_id": "publish", "expected_version": 1},
    )
    assert response.status_code == 503 and response.json()["code"] == "SERVICE_UNAVAILABLE"
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 1


async def test_unanchored_manifest_cannot_be_published(client, admin_headers, db_session, monkeypatch):
    _, _, manifest = await candidate(db_session, monkeypatch)
    manifest.pop("question_id")
    state = await draft(client, admin_headers, manifest)
    verifier = AsyncMock(return_value=True)
    monkeypatch.setattr(publication, "receipt_verifier", lambda: verifier)
    response = await client.post(
        f"{PREFIX}/drafts/{state['id']}/publish",
        headers=admin_headers,
        json={"operation_id": "publish", "expected_version": 1},
    )
    assert response.status_code == 422
    verifier.assert_not_awaited()
