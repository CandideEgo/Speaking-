"""Tests for the one-click seed-full admin endpoint."""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.models.video import Video, VideoStatus
from tests.conftest import TestSessionLocal


async def _ready_official(url: str) -> str:
    """Insert a ready official video for dedup tests; return its id."""
    async with TestSessionLocal() as db:
        v = Video(
            title="Existing",
            source_url=url,
            video_source="imported",
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
        )
        db.add(v)
        await db.commit()
        await db.refresh(v)
        return v.id


class TestSeedFull:
    async def test_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/videos/seed-full",
            headers=auth_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        assert resp.status_code == 403

    async def test_cookies_need_manual_login_returns_423(self, client: AsyncClient, admin_headers: dict):
        with patch(
            "app.services.youtube_cookies_service.ensure_cookies",
            new=AsyncMock(return_value="need_manual_login"),
        ):
            resp = await client.post(
                "/api/v1/videos/seed-full",
                headers=admin_headers,
                json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
            )
        assert resp.status_code == 423
        assert "登录" in resp.json()["detail"]

    async def test_cookies_error_returns_502(self, client: AsyncClient, admin_headers: dict):
        with patch(
            "app.services.youtube_cookies_service.ensure_cookies",
            new=AsyncMock(return_value="error"),
        ):
            resp = await client.post(
                "/api/v1/videos/seed-full",
                headers=admin_headers,
                json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
            )
        assert resp.status_code == 502

    async def test_seeds_with_auto_publish_when_cookies_ok(self, client: AsyncClient, admin_headers: dict):
        """cookies ok -> seed with auto_publish=True; verify the flag is set on the row."""
        with (
            patch(
                "app.services.youtube_cookies_service.ensure_cookies",
                new=AsyncMock(return_value="ok"),
            ),
            patch("app.tasks.video_processing.process_video") as pv,
        ):
            resp = await client.post(
                "/api/v1/videos/seed-full",
                headers=admin_headers,
                json={"source_url": "https://www.youtube.com/watch?v=autopubtest001"},
            )
        assert resp.status_code == 201
        vid = resp.json()["id"]
        # process_video.delay must have been called (head task dispatched).
        pv.delay.assert_called_once_with(vid)
        # auto_publish flag set on the DB row.
        async with TestSessionLocal() as db:
            from sqlalchemy import select

            v = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v.is_official is True
            assert v.is_published is False  # draft until finalize publishes
            assert v.auto_publish is True

    async def test_dedup_returns_existing_ready_video(self, client: AsyncClient, admin_headers: dict):
        """Re-seeding an already-ready URL returns the existing row (no new row, no re-process)."""
        url = "https://www.youtube.com/watch?v=deduptest0001"
        existing_id = await _ready_official(url)
        with (
            patch(
                "app.services.youtube_cookies_service.ensure_cookies",
                new=AsyncMock(return_value="ok"),
            ),
            patch("app.tasks.video_processing.process_video") as pv,
        ):
            resp = await client.post(
                "/api/v1/videos/seed-full",
                headers=admin_headers,
                json={"source_url": url},
            )
        assert resp.status_code == 201
        assert resp.json()["id"] == existing_id
        # No new processing dispatched — dedup hit.
        pv.delay.assert_not_called()
