"""Tests for the profile endpoints: avatar upload + email binding."""

import pytest
from httpx import AsyncClient

_AVATAR_PNG = (
    # Minimal 1x1 PNG (8 bytes header + IHDR + IDAT + IEND) — good enough for content-type checks.
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(autouse=True)
def _force_dev_fake_sms(monkeypatch):
    """Force the SMS service into dev-fake mode (accept code '1234')."""
    import app.services.sms_service as sms_svc

    monkeypatch.setattr(sms_svc, "_real_send_enabled", lambda: False)


class TestAvatarUpload:
    async def test_upload_avatar_sets_url(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/users/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.png", _AVATAR_PNG, "image/png")},
        )
        assert resp.status_code == 200, resp.text
        avatar_url = resp.json()["avatar_url"]
        assert avatar_url.startswith("/media/avatars/")
        assert avatar_url.endswith(".png")

    async def test_upload_avatar_rejects_wrong_type(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/users/me/avatar",
            headers=auth_headers,
            files={"file": ("file.txt", b"not an image", "text/plain")},
        )
        assert resp.status_code == 400

    async def test_upload_avatar_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/users/me/avatar",
            files={"file": ("avatar.png", _AVATAR_PNG, "image/png")},
        )
        assert resp.status_code == 401


class TestBindEmail:
    async def test_bind_email_to_phone_account(self, client: AsyncClient):
        """A phone-only user binds an email; afterwards email+password login works."""
        # Register a phone-only account.
        reg = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": "13800138001", "code": "1234", "password": "Testpass123!"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['token']}"}

        resp = await client.post(
            "/api/v1/users/me/bind-email",
            headers=headers,
            json={"email": "bound@example.com", "password": "Testpass123!"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["email"] == "bound@example.com"

        # Email login works with the same password.
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": "bound@example.com", "password": "Testpass123!"},
        )
        assert login.status_code == 200

    async def test_bind_email_wrong_password_rejected(self, client: AsyncClient):
        reg = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": "13800138002", "code": "1234", "password": "Testpass123!"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['token']}"}
        resp = await client.post(
            "/api/v1/users/me/bind-email",
            headers=headers,
            json={"email": "x@example.com", "password": "WrongPass1!"},
        )
        assert resp.status_code == 400

    async def test_bind_email_taken_by_another_user(self, client: AsyncClient, test_user_data: dict):
        # First user owns test_user_data["email"].
        await client.post("/api/v1/auth/register", json=test_user_data)

        # A phone-only user tries to bind the same email.
        reg = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": "13800138003", "code": "1234", "password": "Testpass123!"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['token']}"}
        resp = await client.post(
            "/api/v1/users/me/bind-email",
            headers=headers,
            json={"email": test_user_data["email"], "password": "Testpass123!"},
        )
        assert resp.status_code == 409
