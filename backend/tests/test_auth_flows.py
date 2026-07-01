"""Tests for the remaining auth flows: refresh, logout, change-password, forgot/reset-password.

These were previously untested and exercise the JWT blacklist (Redis) and the
password-reset token flow.
"""

from httpx import AsyncClient

from app.core.security import create_token, decode_token, token_lookup_hash
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from tests.conftest import TestSessionLocal, hash_password


class TestRefreshToken:
    async def test_refresh_returns_new_access_token(self, client: AsyncClient, test_user_data: dict):
        # Register to get a refresh token
        resp = await client.post("/api/v1/auth/register", json=test_user_data)
        refresh_token = resp.json()["refresh_token"]

        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "refresh_token" in data
        # New access token must differ from the refresh token
        assert data["token"] != refresh_token

    async def test_refresh_with_access_token_rejected(self, client: AsyncClient, test_user_data: dict):
        resp = await client.post("/api/v1/auth/register", json=test_user_data)
        access_token = resp.json()["token"]

        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
        assert resp.status_code == 401
        assert "refresh" in resp.json()["detail"].lower()

    async def test_refresh_with_garbage_token_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
        assert resp.status_code == 401

    async def test_refresh_blacklists_old_refresh_token(self, client: AsyncClient, test_user_data: dict):
        """Rotating a refresh token must invalidate the old one."""
        resp = await client.post("/api/v1/auth/register", json=test_user_data)
        old_refresh = resp.json()["refresh_token"]

        # Rotate once
        await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})

        # Reusing the old refresh token must now fail
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
        assert resp.status_code == 401


class TestLogout:
    async def test_logout_requires_auth(self, client: AsyncClient):
        # logout is behind get_current_user; calling without auth → 401
        resp = await client.post("/api/v1/auth/logout", json={})
        assert resp.status_code == 401

    async def test_logout_blacklists_access_token(self, client: AsyncClient, test_user_data: dict):
        resp = await client.post("/api/v1/auth/register", json=test_user_data)
        token = resp.json()["token"]
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
        resp = await client.post("/api/v1/auth/register", json=test_user_data)
        headers = {"Authorization": f"Bearer {resp.json()['token']}"}

        resp = await client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"current_password": "WrongPass1!", "new_password": "Newpass123!"},
        )
        assert resp.status_code == 400
        assert "incorrect" in resp.json()["detail"].lower()

    async def test_change_password_success(self, client: AsyncClient, test_user_data: dict):
        resp = await client.post("/api/v1/auth/register", json=test_user_data)
        headers = {"Authorization": f"Bearer {resp.json()['token']}"}

        resp = await client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"current_password": test_user_data["password"], "new_password": "BrandNew123!"},
        )
        assert resp.status_code == 200, f"change-password failed: {resp.text}"

        # Old password no longer works at login
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": test_user_data["email"], "password": test_user_data["password"]},
        )
        assert login_resp.status_code == 401

        # New password works
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": test_user_data["email"], "password": "BrandNew123!"},
        )
        assert login_resp.status_code == 200


class TestForgotResetPassword:
    async def test_forgot_password_unknown_email_returns_same_message(self, client: AsyncClient):
        """Must not reveal whether an email is registered."""
        resp = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody@example.com"},
        )
        assert resp.status_code == 200
        assert "reset link" in resp.json()["message"].lower()

    async def test_reset_password_with_invalid_token_rejected(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": "invalid-token", "new_password": "Newpass123!"},
        )
        assert resp.status_code == 400

    async def test_full_reset_flow(self, client: AsyncClient, test_user_data: dict, test_password: str):
        # Create a user directly
        async with TestSessionLocal() as db:
            user = User(
                email="resetflow@example.com",
                hashed_password=hash_password(test_password),
                name="Reset User",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        # Simulate the reset token that forgot-password would issue: store a
        # hashed token (the API hashes the raw token before persisting).
        from app.core.security import hash_password as hp

        raw_token = "raw-reset-token-123"
        from datetime import UTC, datetime, timedelta

        async with TestSessionLocal() as db:
            db.add(
                PasswordResetToken(
                    user_id=user.id,
                    token_hash=hp(raw_token),
                    token_lookup=token_lookup_hash(raw_token),
                    expires_at=datetime.now(UTC) + timedelta(minutes=30),
                )
            )
            await db.commit()

        # Reset the password
        new_pw = "CompletelyNew123!"
        resp = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": new_pw},
        )
        assert resp.status_code == 200

        # New password works at login, old does not
        assert (
            await client.post(
                "/api/v1/auth/login",
                json={"email": "resetflow@example.com", "password": new_pw},
            )
        ).status_code == 200
        assert (
            await client.post(
                "/api/v1/auth/login",
                json={"email": "resetflow@example.com", "password": test_password},
            )
        ).status_code == 401

        # Token cannot be reused
        resp = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": "Another123!"},
        )
        assert resp.status_code == 400


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
        resp = await client.post("/api/v1/auth/register", json=test_user_data)
        user_id = resp.json()["user"]["id"]
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

        # A fresh login yields a working token.
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": test_user_data["email"], "password": "BrandNew123!"},
        )
        assert login.status_code == 200
        new_headers = {"Authorization": f"Bearer {login.json()['token']}"}
        assert (await client.get("/api/v1/users/me", headers=new_headers)).status_code == 200

    async def test_reset_password_invalidates_old_refresh_token(
        self, client: AsyncClient, test_user_data: dict, test_password: str
    ):
        from datetime import UTC, datetime, timedelta

        from app.core.security import hash_password as hp

        # Create a user directly.
        async with TestSessionLocal() as db:
            user = User(
                email="reset-inval@example.com",
                hashed_password=hash_password(test_password),
                name="Reset Inval",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            # Mint an "old" refresh token (iat 60s ago) — predates the reset.
            old_refresh = self._make_token_with_old_iat(user.id, token_type="refresh")
            raw_token = "raw-reset-inval"
            db.add(
                PasswordResetToken(
                    user_id=user.id,
                    token_hash=hp(raw_token),
                    token_lookup=token_lookup_hash(raw_token),
                    expires_at=datetime.now(UTC) + timedelta(minutes=30),
                )
            )
            await db.commit()

        # Perform the reset (sets password_changed_at = now, well after the old iat).
        resp = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": "FreshPass123!"},
        )
        assert resp.status_code == 200

        # The old refresh token must no longer be rotatable.
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
        assert resp.status_code == 401
