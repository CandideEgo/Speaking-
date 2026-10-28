"""Tests for authentication endpoints."""

from httpx import AsyncClient


class TestUserProfile:
    async def test_get_me_returns_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["phone"]
        # /set-password uses this to distinguish first setup from "already set"
        # (otherwise an existing-password account hits a 400 dead end).
        assert data["has_password"] is True

    async def test_get_me_without_token_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/users/me")
        assert resp.status_code == 401
        # HTTP semantics: a 401 challenge must advertise the scheme.
        assert resp.headers.get("www-authenticate") == "Bearer"

    def test_decode_token_with_empty_key_returns_none_instead_of_raising(self, monkeypatch):
        """PyJWT raises InvalidKeyError (not InvalidTokenError) for an empty key."""
        from app.core import security

        token = security.create_token("some-user-id")
        monkeypatch.setattr(security.settings, "jwt_secret", "")
        assert security.decode_token(token) is None

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
