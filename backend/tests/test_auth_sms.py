"""Tests for the phone-based auth flows: SMS register, phone-login, SMS reset-password.

Dev-fake SMS mode is forced on (no Aliyun credentials), so the fixed code "1234"
is accepted by verify_code. The production .env has SMS_LOGIN_ENABLED=true with
real Aliyun credentials, which would otherwise make these tests call the live
Aliyun SDK (and fail without network).
"""

import pytest
from httpx import AsyncClient

from tests.conftest import TestSessionLocal

_DEV_FAKE_CODE = "1234"
_TEST_PASSWORD = "Testpass123!"
_TEST_PHONE = "13800138000"


@pytest.fixture(autouse=True)
def _force_dev_fake_sms(monkeypatch):
    """Force the SMS service into dev-fake mode (accept code '1234')."""
    import app.services.sms_service as sms_svc

    monkeypatch.setattr(sms_svc, "_real_send_enabled", lambda: False)


class TestSmsRegister:
    async def test_register_creates_user_and_returns_token(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/sms/register",
            json={
                "phone": _TEST_PHONE,
                "code": _DEV_FAKE_CODE,
                "password": _TEST_PASSWORD,
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert "token" in data
        assert data["user"]["phone"] == _TEST_PHONE
        assert data["user"]["email"] is None
        assert data["user"]["plan"] == "free"

    async def test_register_with_name(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/sms/register",
            json={
                "phone": _TEST_PHONE,
                "code": _DEV_FAKE_CODE,
                "password": _TEST_PASSWORD,
                "name": "Phone User",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["user"]["name"] == "Phone User"

    async def test_register_duplicate_phone_returns_409(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "password": _TEST_PASSWORD},
        )
        resp = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "password": _TEST_PASSWORD},
        )
        assert resp.status_code == 409
        assert "已注册" in resp.json()["detail"]

    async def test_register_wrong_code_returns_400(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": "0000", "password": _TEST_PASSWORD},
        )
        assert resp.status_code == 400

    async def test_register_weak_password_rejected(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "password": "weak"},
        )
        assert resp.status_code == 422  # validation error


class TestPhoneLogin:
    async def test_login_with_valid_credentials(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "password": _TEST_PASSWORD},
        )
        resp = await client.post(
            "/api/v1/auth/phone-login",
            json={"phone": _TEST_PHONE, "password": _TEST_PASSWORD},
        )
        assert resp.status_code == 200
        assert "token" in resp.json()

    async def test_login_wrong_password_returns_401(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "password": _TEST_PASSWORD},
        )
        resp = await client.post(
            "/api/v1/auth/phone-login",
            json={"phone": _TEST_PHONE, "password": "WrongPass1!"},
        )
        assert resp.status_code == 401

    async def test_login_unregistered_phone_returns_401(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/phone-login",
            json={"phone": "13900000000", "password": _TEST_PASSWORD},
        )
        assert resp.status_code == 401


class TestSmsLoginNoAutoCreate:
    """sms/login must NOT auto-create accounts (registration is via sms/register)."""

    async def test_sms_login_unregistered_returns_404(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/sms/login",
            json={"phone": "13900000000", "code": _DEV_FAKE_CODE},
        )
        assert resp.status_code == 404
        assert "未注册" in resp.json()["detail"]

    async def test_sms_login_registered_returns_token(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "password": _TEST_PASSWORD},
        )
        resp = await client.post(
            "/api/v1/auth/sms/login",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE},
        )
        assert resp.status_code == 200
        assert "token" in resp.json()


class TestSmsResetPassword:
    async def test_reset_password_then_login_with_new(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "password": _TEST_PASSWORD},
        )
        new_pw = "BrandNew123!"
        resp = await client.post(
            "/api/v1/auth/sms/reset-password",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "new_password": new_pw},
        )
        assert resp.status_code == 200

        # Old password no longer works
        assert (
            await client.post(
                "/api/v1/auth/phone-login",
                json={"phone": _TEST_PHONE, "password": _TEST_PASSWORD},
            )
        ).status_code == 401
        # New password works
        assert (
            await client.post(
                "/api/v1/auth/phone-login",
                json={"phone": _TEST_PHONE, "password": new_pw},
            )
        ).status_code == 200

    async def test_reset_password_unregistered_returns_same_message(self, client: AsyncClient):
        """Must not reveal whether the phone is registered (anti-enumeration)."""
        resp = await client.post(
            "/api/v1/auth/sms/reset-password",
            json={"phone": "13900000000", "code": _DEV_FAKE_CODE, "new_password": "AnyNew123!"},
        )
        assert resp.status_code == 200
        assert "已注册" in resp.json()["message"]

    async def test_reset_password_wrong_code_returns_400(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/sms/reset-password",
            json={"phone": _TEST_PHONE, "code": "0000", "new_password": "AnyNew123!"},
        )
        assert resp.status_code == 400

    async def test_reset_password_invalidates_old_session(self, client: AsyncClient):
        """Resetting must invalidate tokens issued before the reset."""
        import uuid
        from datetime import UTC, datetime, timedelta

        from jose import jwt

        from app.core.config import get_settings

        # Register, then mint an "old" access token (iat 60s ago).
        resp = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "password": _TEST_PASSWORD},
        )
        user_id = resp.json()["user"]["id"]

        settings = get_settings()
        now = datetime.now(UTC)
        expire = now + timedelta(minutes=settings.jwt_expire_minutes)
        old_token = jwt.encode(
            {
                "sub": user_id,
                "exp": expire,
                "iat": now - timedelta(seconds=60),
                "type": "access",
                "jti": uuid.uuid4().hex,
            },
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
        )
        old_headers = {"Authorization": f"Bearer {old_token}"}

        # Move password_changed_at into the past so the old token is initially valid.
        async with TestSessionLocal() as db:
            from app.models.user import User as UserModel

            db_user = await db.get(UserModel, user_id)
            db_user.password_changed_at = datetime.now(UTC) - timedelta(minutes=10)
            await db.commit()

        assert (await client.get("/api/v1/users/me", headers=old_headers)).status_code == 200

        # Reset the password (sets password_changed_at = now).
        await client.post(
            "/api/v1/auth/sms/reset-password",
            json={"phone": _TEST_PHONE, "code": _DEV_FAKE_CODE, "new_password": "FreshPass123!"},
        )

        # Old token must now be rejected.
        assert (await client.get("/api/v1/users/me", headers=old_headers)).status_code == 401
