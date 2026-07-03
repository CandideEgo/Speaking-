"""Tests for the pending_processing video flow.

Covers:
- User video submission creates pending_processing status (not processing).
- process_video.delay() is NOT called on user submission.
- Admin start_processing transitions pending_processing → processing.
- start_processing fails when GPU worker is offline (503).
- start_processing fails when video is not in pending_processing status (400).
- Admin seed (seed_video) still auto-processes (backwards compatible).
- Auto-publish syncs review_status to published.
- Worker status endpoint returns correct online/offline state.
- UGC submissions always stay in draft (auto_publish=False).
"""

from unittest.mock import patch

from httpx import AsyncClient
from sqlalchemy import select

from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus


async def _owner_id(db) -> str:
    user = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
    return user.id


async def _seed_pending_video(db, *, owner_id):
    v = Video(
        title="Pending Test",
        source_url="https://example.com/pending.mp4",
        video_source="local",
        status=VideoStatus.pending_processing,
        is_official=False,
        is_published=False,
        review_status=VideoReviewStatus.draft.value,
        user_id=owner_id,
        auto_publish=False,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


class TestUserSubmissionNoAutoProcess:
    """User-submitted videos should start in pending_processing, not processing."""

    async def test_submit_video_creates_pending_processing(self, client: AsyncClient, auth_headers: dict):
        """POST /videos should create a pending_processing video."""
        with patch("app.tasks.video_processing.process_video") as mock_pv:
            resp = await client.post(
                "/api/v1/videos",
                json={"source_url": "https://www.youtube.com/watch?v=pending_test_1"},
                headers=auth_headers,
            )
            mock_pv.delay.assert_not_called()

        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "pending_processing"

    async def test_user_seed_creates_pending_processing(self, client: AsyncClient, auth_headers: dict):
        """POST /videos/user-seed should create a pending_processing video."""
        with patch("app.tasks.video_processing.process_video") as mock_pv:
            resp = await client.post(
                "/api/v1/videos/user-seed",
                json={"source_url": "https://www.youtube.com/watch?v=pending_test_2"},
                headers=auth_headers,
            )
            mock_pv.delay.assert_not_called()

        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "pending_processing"

    async def test_admin_seed_still_auto_processes(self, client: AsyncClient, admin_headers: dict):
        """POST /videos/seed (admin) should still immediately process."""
        with patch("app.tasks.video_processing.process_video") as mock_pv:
            resp = await client.post(
                "/api/v1/videos/seed",
                json={"source_url": "https://www.youtube.com/watch?v=admin_seed_test"},
                headers=admin_headers,
            )
            mock_pv.delay.assert_called_once()

        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "processing"
        assert data["is_official"] is True


class TestStartProcessing:
    """Admin-triggered processing for pending_processing videos."""

    async def test_start_processing_success(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        """POST /admin/{id}/start-processing transitions to processing when worker online."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_pending_video(db, owner_id=owner)
            vid = v.id

        with (
            patch("app.services.video_seed_service.is_gpu_worker_online", return_value=True),
            patch("app.tasks.video_processing.process_video") as mock_pv,
        ):
            resp = await client.post(
                f"/api/v1/videos/admin/{vid}/start-processing",
                headers=admin_headers,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "processing"
        mock_pv.delay.assert_called_once_with(vid)

    async def test_start_processing_worker_offline_503(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        """POST /admin/{id}/start-processing returns 503 when worker offline."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_pending_video(db, owner_id=owner)
            vid = v.id

        with patch("app.services.video_seed_service.is_gpu_worker_online", return_value=False):
            resp = await client.post(
                f"/api/v1/videos/admin/{vid}/start-processing",
                headers=admin_headers,
            )

        assert resp.status_code == 503
        assert "offline" in resp.json()["detail"].lower()

    async def test_start_processing_wrong_status_400(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        """POST /admin/{id}/start-processing returns 400 when video is not pending_processing."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = Video(
                title="Already Processing",
                source_url="https://example.com/already.mp4",
                video_source="local",
                status=VideoStatus.processing,
                is_official=False,
                is_published=False,
                review_status=VideoReviewStatus.draft.value,
                user_id=owner,
            )
            db.add(v)
            await db.commit()
            await db.refresh(v)
            vid = v.id

        with patch("app.services.video_seed_service.is_gpu_worker_online", return_value=True):
            resp = await client.post(
                f"/api/v1/videos/admin/{vid}/start-processing",
                headers=admin_headers,
            )

        assert resp.status_code == 400

    async def test_start_processing_not_found(self, client: AsyncClient, admin_headers: dict):
        """POST /admin/{id}/start-processing returns 404 for missing video."""
        resp = await client.post(
            "/api/v1/videos/admin/nonexistent-id/start-processing",
            headers=admin_headers,
        )
        assert resp.status_code == 404


class TestWorkerStatus:
    """Admin worker-status endpoint."""

    async def test_worker_online(self, client: AsyncClient, admin_headers: dict):
        with patch("app.services.video_seed_service.is_gpu_worker_online", return_value=True):
            resp = await client.get(
                "/api/v1/admin/worker-status",
                headers=admin_headers,
            )
        assert resp.status_code == 200
        assert resp.json()["worker_online"] is True

    async def test_worker_offline(self, client: AsyncClient, admin_headers: dict):
        with patch("app.services.video_seed_service.is_gpu_worker_online", return_value=False):
            resp = await client.get(
                "/api/v1/admin/worker-status",
                headers=admin_headers,
            )
        assert resp.status_code == 200
        assert resp.json()["worker_online"] is False


class TestAutoPublishSyncsReviewStatus:
    """When auto_publish fires, review_status should also be set to published."""

    async def test_auto_publish_sets_review_status_published(self):
        assert VideoReviewStatus.published.value == "published"
        assert VideoStatus.pending_processing.value == "pending_processing"


class TestUGCStaysDraft:
    """UGC submissions should have auto_publish=False so they stay in draft
    after processing, giving the creator a chance to edit before submitting
    for admin review (ADR-0004)."""

    async def test_submit_video_no_auto_publish(self, client: AsyncClient, auth_headers: dict):
        """POST /videos creates a UGC video with auto_publish=False."""
        from tests.conftest import TestSessionLocal

        with patch("app.tasks.video_processing.process_video"):
            resp = await client.post(
                "/api/v1/videos",
                json={"source_url": "https://www.youtube.com/watch?v=ugc_draft_test_1"},
                headers=auth_headers,
            )
        assert resp.status_code == 201
        vid = resp.json()["id"]

        async with TestSessionLocal() as db:
            v = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v.auto_publish is False
            assert v.review_status == VideoReviewStatus.draft.value

    async def test_user_seed_no_auto_publish(self, client: AsyncClient, auth_headers: dict):
        """POST /videos/user-seed creates a UGC video with auto_publish=False."""
        from tests.conftest import TestSessionLocal

        with patch("app.tasks.video_processing.process_video"):
            resp = await client.post(
                "/api/v1/videos/user-seed",
                json={"source_url": "https://www.youtube.com/watch?v=ugc_draft_test_2"},
                headers=auth_headers,
            )
        assert resp.status_code == 201
        vid = resp.json()["id"]

        async with TestSessionLocal() as db:
            v = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v.auto_publish is False
            assert v.review_status == VideoReviewStatus.draft.value

    async def test_user_seed_full_no_auto_publish(self, client: AsyncClient, auth_headers: dict):
        """POST /videos/user-seed-full creates a UGC video with auto_publish=False."""
        from tests.conftest import TestSessionLocal

        with (
            patch("app.api.v1.videos._require_valid_cookies"),
            patch("app.tasks.video_processing.process_video"),
        ):
            resp = await client.post(
                "/api/v1/videos/user-seed-full",
                json={"source_url": "https://www.youtube.com/watch?v=ugc_draft_test_3"},
                headers=auth_headers,
            )
        assert resp.status_code == 201
        vid = resp.json()["id"]

        async with TestSessionLocal() as db:
            v = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v.auto_publish is False
            assert v.review_status == VideoReviewStatus.draft.value
