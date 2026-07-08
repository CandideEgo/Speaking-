"""Tests for auth flows: refresh, logout, change-password, session invalidation.

These exercise the JWT blacklist (Redis) and the password-change / SMS-reset
session-invalidation logic.  SMS-based registration and reset-password are
tested in test_auth_sms.py; this file focuses on token lifecycle.

Dev-fake SMS mode is forced on (no Aliyun credentials), so the fixed code
"1234" is accepted by verify_code. The production .env has
SMS_LOGIN_ENABLED=true with real Aliyun credentials, which would otherwise
make these tests call the live Aliyun SDK (and fail without network).
"""

import pytest
from httpx import AsyncClient

from tests.conftest import TestSessionLocal


@pytest.fixture(autouse=True)
def _force_dev_fake_sms(monkeypatch):
    """Force the SMS service into dev-fake mode (accept code '1234')."""
    import app.services.sms_service as sms_svc

    monkeypatch.setattr(sms_svc, "_real_send_enabled", lambda: False)


async def _sms_register(client: AsyncClient, phone: str, password: str, name: str = "Test User"):
    """Helper: register a user via SMS flow and return the JSON response."""
    await client.post("/api/v1/auth/sms/send-code", json={"phone": phone, "purpose": "register"})
    resp = await client.post(
        "/api/v1/auth/sms/register",
        json={"phone": phone, "code": "1234", "password": password, "name": name},
    )
    assert resp.status_code == 201, f"SMS register failed: {resp.text}"
    return resp.json()


class TestRefreshToken:
    async def test_refresh_returns_new_access_token(self, client: AsyncClient, test_user_data: dict):
        data = await _sms_register(client, test_user_data["phone"], test_user_data["password"], test_user_data["name"])
        refresh_token = data["refresh_token"]

        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "refresh_token" in data
        # New access token must differ from the refresh token
        assert data["token"] != refresh_token

    async def test_refresh_with_access_token_rejected(self, client: AsyncClient, test_user_data: dict):
        data = await _sms_register(client, test_user_data["phone"], test_user_data["password"], test_user_data["name"])
        access_token = data["token"]

        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
        assert resp.status_code == 401
        assert "refresh" in resp.json()["detail"].lower()

    async def test_refresh_with_garbage_token_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
        assert resp.status_code == 401

    async def test_refresh_blacklists_old_refresh_token(self, client: AsyncClient, test_user_data: dict):
        """Rotating a refresh token must invalidate the old one."""
        data = await _sms_register(client, test_user_data["phone"], test_user_data["password"], test_user_data["name"])
        old_refresh = data["refresh_token"]

        # Rotate once
        await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})

        # Reusing the old refresh token must now fail
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
        assert resp.status_code == 401


class TestLogout:
    async def test_logout_requires_auth(self, client: AsyncClient):
        # logout is behind get_current_user; calling without auth -> 401
        resp = await client.post("/api/v1/auth/logout", json={})
        assert resp.status_code == 401

    async def test_logout_blacklists_access_token(self, client: AsyncClient, test_user_data: dict):
        data = await _sms_register(client, test_user_data["phone"], test_user_data["password"], test_user_data["name"])
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Token works before logout
        assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 200

        # Logout
        logout_resp = await client.post("/api/v1/auth/logout", json={}, headers=headers)
        assert logout_resp.status_code == 200

        # Same token must now be rejected (blacklisted)
        assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 401


class TestChangePassword:
    async def test_change_password_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "x", "new_password": "Y"},
        )
        assert resp.status_code == 401

    async def test_change_password_wrong_current_rejected(self, client: AsyncClient, test_user_data: dict):
        data = await _sms_register(client, test_user_data["phone"], test_user_data["password"], test_user_data["name"])
        headers = {"Authorization": f"Bearer {data['token']}"}

        resp = await client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"current_password": "WrongPass1!", "new_password": "Newpass123!"},
        )
        assert resp.status_code == 400
        assert "incorrect" in resp.json()["detail"].lower()

    async def test_change_password_success(self, client: AsyncClient, test_user_data: dict):
        data = await _sms_register(client, test_user_data["phone"], test_user_data["password"], test_user_data["name"])
        headers = {"Authorization": f"Bearer {data['token']}"}

        resp = await client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"current_password": test_user_data["password"], "new_password": "BrandNew123!"},
        )
        assert resp.status_code == 200, f"change-password failed: {resp.text}"

        # Old password no longer works at phone-login
        login_resp = await client.post(
            "/api/v1/auth/phone-login",
            json={"phone": test_user_data["phone"], "password": test_user_data["password"]},
        )
        assert login_resp.status_code == 401

        # New password works
        login_resp = await client.post(
            "/api/v1/auth/phone-login",
            json={"phone": test_user_data["phone"], "password": "BrandNew123!"},
        )
        assert login_resp.status_code == 200


class TestSessionInvalidation:
    """Changing or resetting the password must invalidate prior sessions.

    These tests mint tokens with an explicit, old ``iat`` (60s in the past) so
    the invalidation is deterministic regardless of the JWT-iat truncation and
    the 2s leeway in the auth check.
    """

    @staticmethod
    def _make_token_with_old_iat(user_id: str, token_type: str = "access", age_seconds: int = 60) -> str:
        """Build a JWT whose ``iat`` is ``age_seconds`` in the past."""
        import uuid
        from datetime import UTC, datetime, timedelta

        from jose import jwt

        from app.core.config import get_settings

        settings = get_settings()
        now = datetime.now(UTC)
        expire = now + timedelta(minutes=settings.jwt_expire_minutes)
        payload = {
            "sub": user_id,
            "exp": expire,
            "iat": now - timedelta(seconds=age_seconds),
            "type": token_type,
            "jti": uuid.uuid4().hex,
        }
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    async def test_change_password_invalidates_old_access_token(self, client: AsyncClient, test_user_data: dict):
        # Register so the user exists, then mint an "old" access token (iat 60s ago).
        data = await _sms_register(client, test_user_data["phone"], test_user_data["password"], test_user_data["name"])
        user_id = data["user"]["id"]
        old_token = self._make_token_with_old_iat(user_id, token_type="access")
        old_headers = {"Authorization": f"Bearer {old_token}"}

        # Move the user's password_changed_at into the past so the 60s-old token
        # is considered newer than the last "change" (sanity check passes).
        from datetime import UTC, datetime, timedelta

        async with TestSessionLocal() as db:
            from app.models.user import User as UserModel

            db_user = await db.get(UserModel, user_id)
            db_user.password_changed_at = datetime.now(UTC) - timedelta(minutes=10)
            await db.commit()

        # Sanity: the old token works (its iat is 60s ago, after the 10-min-old change).
        assert (await client.get("/api/v1/users/me", headers=old_headers)).status_code == 200

        # Change the password (sets password_changed_at = now, well after the old iat).
        await client.post(
            "/api/v1/auth/change-password",
            headers=old_headers,
            json={
                "current_password": test_user_data["password"],
                "new_password": "BrandNew123!",
            },
        )

        # The old access token must now be rejected (issued before the change).
        resp = await client.get("/api/v1/users/me", headers=old_headers)
        assert resp.status_code == 401

        # A fresh phone-login yields a working token.
        login = await client.post(
            "/api/v1/auth/phone-login",
            json={"phone": test_user_data["phone"], "password": "BrandNew123!"},
        )
        assert login.status_code == 200
        new_headers = {"Authorization": f"Bearer {login.json()['token']}"}
        assert (await client.get("/api/v1/users/me", headers=new_headers)).status_code == 200

    async def test_sms_reset_password_invalidates_old_refresh_token(
        self, client: AsyncClient, test_user_data: dict, test_password: str
    ):
        # Register a user via SMS
        data = await _sms_register(client, test_user_data["phone"], test_password, "Reset Inval")
        user_id = data["user"]["id"]

        # Mint an "old" refresh token (iat 60s ago) — predates the reset.
        old_refresh = self._make_token_with_old_iat(user_id, token_type="refresh")

        # Send reset code and perform the reset (sets password_changed_at = now).
        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": test_user_data["phone"], "purpose": "reset_password"},
        )
        resp = await client.post(
            "/api/v1/auth/sms/reset-password",
            json={"phone": test_user_data["phone"], "code": "1234", "new_password": "FreshPass123!"},
        )
        assert resp.status_code == 200

        # The old refresh token must no longer be rotatable.
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
        assert resp.status_code == 401
