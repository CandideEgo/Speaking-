"""Content preparation cannot quietly promote untrusted source artifacts."""

import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from app.core import database
from app.core.errors import AppError
from app.models.content_publication import ContentPublicationOperation
from app.models.teaching import ExamAnalysisRevision
from app.models.user import RoleType
from app.schemas.content_publication import WithdrawContentRevision
from app.services.teaching import publication
from scripts.qualify_teaching_content import inventory, manifests
from tests.conftest import TestSessionLocal
from tests.teaching_fixtures import original_candidate, seed_original_content


def test_inventory_quarantines_candidates_without_inventing_verification(tmp_path):
    result = inventory(tmp_path)
    assert result["read_only"] and result["verified_in_source_artifacts"] == 0
    assert len(result["candidates"]) == 20
    assert all(item["status"] == "quarantined" for item in result["candidates"])


async def test_manifest_check_is_not_publication_and_import_requires_authentic_receipts(tmp_path):
    path = tmp_path / "original.json"
    path.write_text(json.dumps(original_candidate(), ensure_ascii=False), encoding="utf-8")
    result, code = await manifests(path)
    assert code == 0 and result["published"] == 0
    assert not result["items"][0]["receipts_authenticated"]
    blocked, code = await manifests(path, publish=True)
    assert code == 2 and blocked["code"] == "SERVICE_UNAVAILABLE"
    assert blocked["published"] == 0


async def test_cli_import_is_audited_replayable_and_cannot_resurrect_withdrawn_revision(
    tmp_path, db_session, monkeypatch
):
    user, _, _, candidate = await seed_original_content(db_session)
    user.role = RoleType.admin
    await db_session.commit()
    monkeypatch.setattr(database, "get_async_session_maker", lambda: TestSessionLocal)
    monkeypatch.setattr(publication, "receipt_verifier", lambda: AsyncMock(return_value=True))
    path = tmp_path / "candidate.json"
    path.write_text(json.dumps(candidate), encoding="utf-8")
    result, code = await manifests(path, publish=True, actor_id=user.id, operation_id="batch-one")
    assert code == 0 and result["published"] == 1 and not result["items"][0]["replayed"]
    revision_id = result["items"][0]["revision_id"]
    # A successful import replays without consulting a now-unavailable verifier.
    monkeypatch.setattr(publication, "receipt_verifier", lambda: None)
    replay, code = await manifests(path, publish=True, actor_id=user.id, operation_id="batch-one")
    assert code == 0 and replay["items"][0]["replayed"]
    assert replay["items"][0]["revision_id"] == revision_id
    assert await db_session.scalar(select(func.count()).select_from(ContentPublicationOperation)) == 3
    await publication.withdraw(
        db_session,
        user.id,
        revision_id,
        WithdrawContentRevision(
            operation_id="withdraw", expected_status="auto_verified", reason="Needs source rechecking"
        ),
    )
    await db_session.commit()
    replay, code = await manifests(path, publish=True, actor_id=user.id, operation_id="batch-one")
    assert code == 0 and replay["published"] == 0 and replay["items"][0]["publication_status"] == "withdrawn"
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 2
    path.write_text(json.dumps([candidate, candidate]), encoding="utf-8")
    with pytest.raises(AppError) as exc:
        await manifests(path, publish=True, actor_id=user.id, operation_id="batch-one")
    assert exc.value.code == "IDEMPOTENCY_CONFLICT"


async def test_cli_rejects_non_admin_actor_before_receipt_io(tmp_path, db_session, monkeypatch):
    user, _, _, candidate = await seed_original_content(db_session)
    monkeypatch.setattr(database, "get_async_session_maker", lambda: TestSessionLocal)
    verifier = AsyncMock(return_value=True)
    monkeypatch.setattr(publication, "receipt_verifier", lambda: verifier)
    path = tmp_path / "candidate.json"
    path.write_text(json.dumps(candidate), encoding="utf-8")
    with pytest.raises(AppError) as exc:
        await manifests(path, publish=True, actor_id=user.id, operation_id="batch-one")
    assert exc.value.status_code == 403
    verifier.assert_not_awaited()


async def test_malformed_manifest_entries_report_failure_without_traceback(tmp_path):
    path = tmp_path / "malformed.json"
    path.write_text(json.dumps([{}, ["not a candidate"], "text", None]), encoding="utf-8")
    result, code = await manifests(path)
    assert code == 1 and result["published"] == 0
    assert len(result["items"]) == 4 and all(row["structural_checks"] == "failed" for row in result["items"])
