"""Tests for video endpoints."""
import pytest
from httpx import AsyncClient


class TestSubmitVideo:
    async def test_submit_video_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/videos", json={
            "source_url": "https://www.youtube.com/watch?v=abcdefghijk",
        })
        assert resp.status_code == 401

    async def test_submit_youtube_video_creates_record(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/videos",
            headers=auth_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["source_url"] == "https://www.youtube.com/watch?v=abcdefghijk"
        assert data["platform"] == "youtube"
        assert data["status"] in ("processing", "ready_subtitles", "ready", "error")

    async def test_submit_bilibili_video(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/videos",
            headers=auth_headers,
            json={"source_url": "https://www.bilibili.com/video/BV1xx411c7mD"},
        )
        assert resp.status_code == 201
        assert resp.json()["platform"] == "bilibili"


class TestListVideos:
    async def test_list_videos_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos")
        assert resp.status_code == 401

    async def test_list_videos_returns_user_videos(
        self, client: AsyncClient, auth_headers: dict
    ):
        # Submit a video first
        await client.post(
            "/api/v1/videos",
            headers=auth_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        resp = await client.get("/api/v1/videos", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 1


class TestPublicVideos:
    async def test_list_public_videos(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos/public")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestSeedVideo:
    async def test_seed_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/videos/seed",
            headers=auth_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        assert resp.status_code == 403  # regular user cannot seed

    async def test_seed_as_admin_succeeds(
        self, client: AsyncClient, admin_headers: dict
    ):
        resp = await client.post(
            "/api/v1/videos/seed",
            headers=admin_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        assert resp.status_code == 201
        assert resp.json()["is_official"] is True


class TestGetVideo:
    async def test_get_nonexistent_video_returns_404(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos/nonexistent-id")
        assert resp.status_code == 404


class TestVideoQuiz:
    async def test_get_quiz_returns_empty_for_video_without_quiz(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos/nonexistent-id/quiz")
        assert resp.status_code == 404
