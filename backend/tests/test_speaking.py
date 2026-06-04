"""Tests for speaking practice endpoints."""
import pytest
from httpx import AsyncClient


class TestSpeakingStats:
    async def test_stats_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/speaking/stats")
        assert resp.status_code == 401

    async def test_stats_returns_zero_for_new_user(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/speaking/stats", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_speaking_attempts" in data
        assert data["total_speaking_attempts"] == 0


class TestSpeakingAttempts:
    async def test_attempts_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/speaking/attempts")
        assert resp.status_code == 401

    async def test_attempts_returns_empty_for_new_user(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/speaking/attempts", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) == 0


class TestSubmitPractice:
    async def test_practice_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/speaking/practice")
        assert resp.status_code == 401  # or 422 for missing form data

    async def test_practice_invalid_subtitle_id(
        self, client: AsyncClient, auth_headers: dict
    ):
        # Create a fake audio file
        from io import BytesIO
        audio_content = BytesIO(b"fake audio data")
        resp = await client.post(
            "/api/v1/speaking/practice",
            headers=auth_headers,
            files={"audio": ("test.webm", audio_content, "audio/webm")},
            data={"subtitle_id": "nonexistent-id"},
        )
        assert resp.status_code == 404
