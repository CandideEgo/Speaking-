"""PostgreSQL publication races and the actual HTTP transaction boundary."""

import asyncio
import copy
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text, update

from app.core.database import get_async_session_maker, get_db
from app.core.errors import AppError
from app.core.security import create_token
from app.main import create_app
from app.models.content_publication import ContentPublicationOperation
from app.models.exam_test import ExamQuestion
from app.models.teaching import ExamAnalysisRevision
from app.models.user import RoleType, User
from app.services.teaching import content, publication
from tests.teaching_fixtures import seed_original_content
from tests.test_learning_context_pg import assert_blocked

pytestmark = pytest.mark.integration
PREFIX = "/api/v1/admin/teaching-content"


@pytest_asyncio.fixture
async def pg_client():
    async def sessions():
        async with get_async_session_maker()() as db:
            yield db

    app = create_app()
    app.dependency_overrides[get_db] = sessions
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def seed(monkeypatch):
    async with get_async_session_maker()() as db:
        user, _, question, manifest = await seed_original_content(db)
        user.role = RoleType.admin
        await db.commit()
        monkeypatch.setattr(publication, "receipt_verifier", lambda: AsyncMock(return_value=True))
        return {"Authorization": f"Bearer {create_token(user.id)}"}, question.id, copy.deepcopy(manifest)


async def draft(client, headers, manifest, operation):
    response = await client.post(
        f"{PREFIX}/drafts", headers=headers, json={"operation_id": operation, "manifest": manifest}
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.parametrize("same_operation", [True, False])
async def test_concurrent_publish_is_single_effect(pg_client, monkeypatch, same_operation):
    headers, _, manifest = await seed(monkeypatch)
    draft_id = await draft(pg_client, headers, manifest, "create")
    barrier = asyncio.Barrier(2)

    async def invoke(index):
        await barrier.wait()
        return await pg_client.post(
            f"{PREFIX}/drafts/{draft_id}/publish",
            headers=headers,
            json={"operation_id": "publish" if same_operation else f"publish-{index}", "expected_version": 1},
        )

    results = await asyncio.gather(invoke(1), invoke(2))
    assert sorted(r.status_code for r in results) == ([200, 200] if same_operation else [200, 409])
    if same_operation:
        assert results[0].json()["published_revision_id"] == results[1].json()["published_revision_id"]
        assert sorted(r.json()["replayed"] for r in results) == [False, True]
    async with get_async_session_maker()() as db:
        assert await db.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 2
        assert await db.scalar(select(func.count()).select_from(ContentPublicationOperation)) == 2


async def test_concurrent_drafts_share_serial_revision_numbering(pg_client, monkeypatch):
    headers, _, manifest = await seed(monkeypatch)
    first = await draft(pg_client, headers, manifest, "create-one")
    second = await draft(pg_client, headers, manifest, "create-two")
    responses = await asyncio.gather(
        *[
            pg_client.post(
                f"{PREFIX}/drafts/{draft_id}/publish",
                headers=headers,
                json={"operation_id": f"publish-{index}", "expected_version": 1},
            )
            for index, draft_id in enumerate((first, second))
        ]
    )
    assert [r.status_code for r in responses] == [200, 200]
    async with get_async_session_maker()() as db:
        assert list(
            (
                await db.execute(select(ExamAnalysisRevision.revision_no).order_by(ExamAnalysisRevision.revision_no))
            ).scalars()
        ) == [1, 2, 3]


async def test_edit_can_commit_during_verification_and_invalidates_prepared_proof(pg_client, monkeypatch):
    headers, _, manifest = await seed(monkeypatch)
    draft_id = await draft(pg_client, headers, manifest, "create")
    started, resume = asyncio.Event(), asyncio.Event()

    async def verifier(_receipt):
        started.set()
        await resume.wait()
        return True

    monkeypatch.setattr(publication, "receipt_verifier", lambda: verifier)
    pending = asyncio.create_task(
        pg_client.post(
            f"{PREFIX}/drafts/{draft_id}/publish",
            headers=headers,
            json={"operation_id": "publish", "expected_version": 1},
        )
    )
    try:
        await asyncio.wait_for(started.wait(), 5)
        edited = await asyncio.wait_for(
            pg_client.put(
                f"{PREFIX}/drafts/{draft_id}",
                headers=headers,
                json={"operation_id": "edit", "expected_version": 1, "manifest": {}},
            ),
            5,
        )
        assert edited.status_code == 200
        resume.set()
        response = await asyncio.wait_for(pending, 5)
        assert response.status_code == 409 and response.json()["code"] == "CONTENT_REVISION_MISMATCH"
    finally:
        resume.set()
        if not pending.done():
            pending.cancel()
        await asyncio.gather(pending, return_exceptions=True)
    async with get_async_session_maker()() as db:
        assert await db.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 1
        assert await db.scalar(select(func.count()).select_from(ContentPublicationOperation)) == 2


async def test_bank_change_while_publication_waits_is_rechecked_after_lock(monkeypatch):
    _, qid, manifest = await seed(monkeypatch)
    maker = get_async_session_maker()
    async with maker() as importer, maker() as publisher:
        importer_pid = await importer.scalar(text("SELECT pg_backend_pid()"))
        publisher_pid = await publisher.scalar(text("SELECT pg_backend_pid()"))
        question = await importer.get(ExamQuestion, qid)
        question.question = "Changed by importer before publication locks are acquired"
        await importer.flush()

        async def publish():
            try:
                await content.publish_revision(publisher, manifest, verify_receipt=AsyncMock(return_value=True))
                await publisher.commit()
            except AppError as exc:
                await publisher.rollback()
                return exc.code
            return "published"

        pending = asyncio.create_task(publish())
        try:
            await assert_blocked(publisher_pid, importer_pid)
            await importer.commit()
            assert await asyncio.wait_for(pending, 5) == "CONTENT_REVISION_MISMATCH"
        finally:
            if not pending.done():
                pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 1


async def test_admin_revocation_during_verification_blocks_final_write(pg_client, monkeypatch):
    headers, _, manifest = await seed(monkeypatch)
    draft_id = await draft(pg_client, headers, manifest, "create")
    started, resume = asyncio.Event(), asyncio.Event()

    async def verifier(_receipt):
        started.set()
        await resume.wait()
        return True

    monkeypatch.setattr(publication, "receipt_verifier", lambda: verifier)
    pending = asyncio.create_task(
        pg_client.post(
            f"{PREFIX}/drafts/{draft_id}/publish",
            headers=headers,
            json={"operation_id": "publish", "expected_version": 1},
        )
    )
    try:
        await asyncio.wait_for(started.wait(), 5)
        async with get_async_session_maker()() as db:
            await db.execute(update(User).values(role=RoleType.user))
            await db.commit()
        resume.set()
        response = await asyncio.wait_for(pending, 5)
        assert response.status_code == 403
    finally:
        resume.set()
        if not pending.done():
            pending.cancel()
        await asyncio.gather(pending, return_exceptions=True)
    async with get_async_session_maker()() as db:
        assert await db.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 1
        assert await db.scalar(select(func.count()).select_from(ContentPublicationOperation)) == 1
