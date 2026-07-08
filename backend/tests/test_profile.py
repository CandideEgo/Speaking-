"""Tests for the profile endpoints: avatar upload + change phone."""

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


class TestChangePhone:
    async def test_change_phone_success(self, client: AsyncClient):
        """A user changes their phone number via SMS verification."""
        # Register with phone A.
        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": "13800138001", "purpose": "register"},
        )
        reg = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": "13800138001", "code": "1234", "password": "Testpass123!"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['token']}"}

        # Send code to new phone B.
        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": "13800138002", "purpose": "change_phone"},
        )

        # Change phone.
        resp = await client.post(
            "/api/v1/auth/sms/change-phone",
            headers=headers,
            json={"new_phone": "13800138002", "code": "1234", "password": "Testpass123!"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["phone"] == "13800138002"

    async def test_change_phone_wrong_password(self, client: AsyncClient):
        """Wrong current password returns 400."""
        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": "13800138003", "purpose": "register"},
        )
        reg = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": "13800138003", "code": "1234", "password": "Testpass123!"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['token']}"}

        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": "13800138004", "purpose": "change_phone"},
        )

        resp = await client.post(
            "/api/v1/auth/sms/change-phone",
            headers=headers,
            json={"new_phone": "13800138004", "code": "1234", "password": "WrongPass1!"},
        )
        assert resp.status_code == 400

    async def test_change_phone_wrong_code(self, client: AsyncClient):
        """Wrong SMS code returns 400."""
        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": "13800138005", "purpose": "register"},
        )
        reg = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": "13800138005", "code": "1234", "password": "Testpass123!"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['token']}"}

        resp = await client.post(
            "/api/v1/auth/sms/change-phone",
            headers=headers,
            json={"new_phone": "13800138006", "code": "999999", "password": "Testpass123!"},
        )
        assert resp.status_code == 400

    async def test_change_phone_already_registered(self, client: AsyncClient):
        """Changing to a phone already registered returns 409."""
        # Register phone A.
        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": "13800138007", "purpose": "register"},
        )
        reg_a = await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": "13800138007", "code": "1234", "password": "Testpass123!"},
        )
        headers_a = {"Authorization": f"Bearer {reg_a.json()['token']}"}

        # Register phone B.
        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": "13800138008", "purpose": "register"},
        )
        await client.post(
            "/api/v1/auth/sms/register",
            json={"phone": "13800138008", "code": "1234", "password": "Testpass123!"},
        )

        # Try to change A's phone to B.
        await client.post(
            "/api/v1/auth/sms/send-code",
            json={"phone": "13800138008", "purpose": "change_phone"},
        )

        resp = await client.post(
            "/api/v1/auth/sms/change-phone",
            headers=headers_a,
            json={"new_phone": "13800138008", "code": "1234", "password": "Testpass123!"},
        )
        assert resp.status_code == 409
