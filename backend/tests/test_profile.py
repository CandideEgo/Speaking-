"""Tests for the profile endpoints: avatar upload + change phone."""

import pytest
from httpx import AsyncClient
from starlette.datastructures import UploadFile as StarletteUploadFile

_AVATAR_PNG = (
    # Minimal 1x1 PNG (8 bytes header + IHDR + IDAT + IEND) — good enough for content-type checks.
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

# Must match users._AVATAR_MAX_SIZE.
_AVATAR_MAX_SIZE = 5 * 1024 * 1024
# Comfortably past the cap *and* past the multipart-envelope slack the
# Content-Length pre-check leaves, so the pre-check is what fires.
_OVERSIZED_AVATAR = _AVATAR_PNG + b"\x00" * (_AVATAR_MAX_SIZE + 64 * 1024)


def _record_reads(monkeypatch) -> list[int]:
    """Record every ``UploadFile.read(size)`` issued while the test runs.

    The route's file object is a plain ``starlette.datastructures.UploadFile``
    (FastAPI annotates the parameter with its own subclass but the parser
    produces the base class), so that is the class to instrument.
    """
    reads: list[int] = []
    real_read = StarletteUploadFile.read

    async def recording_read(self, size: int = -1):
        reads.append(size)
        return await real_read(self, size)

    monkeypatch.setattr(StarletteUploadFile, "read", recording_read)
    return reads


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

    async def test_upload_avatar_rejects_oversized_file(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/users/me/avatar",
            headers=auth_headers,
            files={"file": ("big.png", _OVERSIZED_AVATAR, "image/png")},
        )
        assert resp.status_code == 413, resp.text
        assert resp.json()["message"] == "图片过大，最大 5MB"

    async def test_upload_avatar_oversized_is_refused_before_any_read(
        self, client: AsyncClient, auth_headers: dict, monkeypatch
    ):
        """H10 regression: the cap used to be enforced only *after*
        ``await file.read()``, so the whole upload — up to nginx's
        ``client_max_body_size 500m`` — was materialized in memory before being
        rejected. The declared Content-Length must stop it before any read."""
        reads = _record_reads(monkeypatch)

        resp = await client.post(
            "/api/v1/users/me/avatar",
            headers=auth_headers,
            files={"file": ("big.png", _OVERSIZED_AVATAR, "image/png")},
        )

        assert resp.status_code == 413, resp.text
        assert reads == []

    async def test_upload_avatar_oversized_with_forged_content_length_stops_reading(
        self, client: AsyncClient, auth_headers: dict, monkeypatch
    ):
        """Content-Length can be omitted or forged, so the chunked guard has to
        hold on its own: the reader must stop within one chunk of the cap
        instead of draining the whole part into memory."""
        boundary = "----speakingh10"
        body_parts = [
            (
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="file"; filename="big.png"\r\n'
                "Content-Type: image/png\r\n\r\n"
            ).encode(),
            _AVATAR_PNG + b"\x00" * (_AVATAR_MAX_SIZE + 4096),
            f"\r\n--{boundary}--\r\n".encode(),
        ]
        reads = _record_reads(monkeypatch)

        resp = await client.post(
            "/api/v1/users/me/avatar",
            headers={
                **auth_headers,
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Content-Length": "100",
            },
            content=b"".join(body_parts),
        )

        assert resp.status_code == 413, resp.text
        assert all(size > 0 for size in reads)
        # 5 MB cap + 4 KB payload: the sixth 1 MB chunk is where the cumulative
        # size crosses the cap, so nothing beyond it is read.
        assert len(reads) == 6


class TestGender:
    """Gender drives the built-in default avatar; the id hash only covers "not filled in"."""

    async def test_starts_unset(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["gender"] is None

    async def test_set_and_persist(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch("/api/v1/users/me", headers=auth_headers, json={"gender": "female"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["gender"] == "female"

        again = await client.get("/api/v1/users/me", headers=auth_headers)
        assert again.json()["gender"] == "female"

    async def test_change_gender(self, client: AsyncClient, auth_headers: dict):
        await client.patch("/api/v1/users/me", headers=auth_headers, json={"gender": "female"})
        resp = await client.patch("/api/v1/users/me", headers=auth_headers, json={"gender": "male"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["gender"] == "male"

    async def test_rejects_unknown_value(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch("/api/v1/users/me", headers=auth_headers, json={"gender": "other"})
        assert resp.status_code == 422

    async def test_patching_other_fields_keeps_gender(self, client: AsyncClient, auth_headers: dict):
        """The update handler skips None fields, so a name-only PATCH must not wipe it."""
        await client.patch("/api/v1/users/me", headers=auth_headers, json={"gender": "female"})
        resp = await client.patch("/api/v1/users/me", headers=auth_headers, json={"name": "小明"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["gender"] == "female"

    async def test_gender_outlives_an_upload(self, client: AsyncClient, auth_headers: dict):
        """Uploading must not discard it — it is what remains once the photo is gone."""
        await client.patch("/api/v1/users/me", headers=auth_headers, json={"gender": "male"})
        resp = await client.post(
            "/api/v1/users/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.png", _AVATAR_PNG, "image/png")},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["gender"] == "male"


class TestUserNameLength:
    """``User.name`` is ``String(100)`` and registration already caps the name
    at 100, so the update path must cap it too — otherwise the two entry points
    disagree and the over-long value reaches PostgreSQL, which rejects it."""

    async def test_rejects_name_past_the_column_width(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch("/api/v1/users/me", headers=auth_headers, json={"name": "名" * 101})
        assert resp.status_code == 422

    async def test_name_at_the_column_width_is_accepted(self, client: AsyncClient, auth_headers: dict):
        boundary = "名" * 100
        resp = await client.patch("/api/v1/users/me", headers=auth_headers, json={"name": boundary})
        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == boundary

    async def test_name_budget_matches_registration(self, client: AsyncClient, auth_headers: dict):
        """Both entry points must agree on where the boundary is."""
        from app.schemas.user import SmsRegisterRequest, UserUpdate

        update_cap = UserUpdate.model_fields["name"].metadata[0].max_length
        register_cap = SmsRegisterRequest.model_fields["name"].metadata[0].max_length
        assert update_cap == register_cap


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
