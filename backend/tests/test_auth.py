"""Tests for authentication endpoints."""

from httpx import AsyncClient


class TestUserProfile:
    async def test_get_me_returns_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["phone"]

    async def test_get_me_without_token_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/users/me")
        assert resp.status_code == 401

    async def test_update_me_level(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch(
            "/api/v1/users/me",
            headers=auth_headers,
            json={"level": "B2"},
        )
        assert resp.status_code == 200
        assert resp.json()["level"] == "B2"

    async def test_update_me_invalid_level(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch(
            "/api/v1/users/me",
            headers=auth_headers,
            json={"level": "D5"},
        )
        assert resp.status_code == 422  # validation error
