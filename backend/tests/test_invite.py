"""Tests for invite code endpoints."""
import pytest
from httpx import AsyncClient


class TestGenerateCodes:
    async def test_generate_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/invite-codes/generate",
            headers=auth_headers,
            json={"count": 5, "plan": "pro", "duration_days": 30},
        )
        assert resp.status_code == 403

    async def test_generate_as_admin(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post(
            "/api/v1/invite-codes/generate",
            headers=admin_headers,
            json={"count": 3, "plan": "pro", "duration_days": 30, "batch_label": "test-batch"},
        )
        assert resp.status_code == 200
        codes = resp.json()
        assert len(codes) == 3
        for c in codes:
            assert len(c["code"]) == 12  # XXXX-XXXX-XX
            assert c["is_used"] is False

    async def test_generate_without_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/invite-codes/generate",
            json={"count": 1, "plan": "pro", "duration_days": 30},
        )
        assert resp.status_code == 401


class TestRedeemCode:
    async def _generate_code(self, client: AsyncClient, admin_headers: dict) -> str:
        resp = await client.post(
            "/api/v1/invite-codes/generate",
            headers=admin_headers,
            json={"count": 1, "plan": "pro", "duration_days": 30},
        )
        return resp.json()[0]["code"]

    async def test_redeem_upgrades_user(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        code = await self._generate_code(client, admin_headers)

        resp = await client.post(
            "/api/v1/invite-codes/redeem",
            headers=auth_headers,
            json={"code": code},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["plan"] == "pro"

        # Verify user is now Pro
        me = await client.get("/api/v1/users/me", headers=auth_headers)
        assert me.json()["plan"] == "pro"

    async def test_redeem_invalid_code(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/invite-codes/redeem",
            headers=auth_headers,
            json={"code": "INVALID-CODE"},
        )
        assert resp.status_code == 404

    async def test_redeem_already_used_code(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        code = await self._generate_code(client, admin_headers)

        # First redeem — success
        await client.post(
            "/api/v1/invite-codes/redeem",
            headers=auth_headers,
            json={"code": code},
        )

        # Create another user and try to use same code
        await client.post("/api/v1/auth/register", json={
            "email": "another@example.com",
            "password": "pass123456",
        })
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": "another@example.com",
            "password": "pass123456",
        })
        token = login_resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.post(
            "/api/v1/invite-codes/redeem",
            headers=headers,
            json={"code": code},
        )
        assert resp.status_code == 400

    async def test_redeem_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/invite-codes/redeem",
            json={"code": "TEST-CODE-01"},
        )
        assert resp.status_code == 401


class TestListAndExport:
    async def test_list_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/invite-codes", headers=auth_headers)
        assert resp.status_code == 403

    async def test_export_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/invite-codes/export", headers=auth_headers)
        assert resp.status_code == 403

    async def test_list_as_admin(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get("/api/v1/invite-codes", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_export_as_admin(
        self, client: AsyncClient, admin_headers: dict
    ):
        # Generate some codes first
        await client.post(
            "/api/v1/invite-codes/generate",
            headers=admin_headers,
            json={"count": 2, "plan": "pro", "duration_days": 30},
        )
        resp = await client.get("/api/v1/invite-codes/export", headers=admin_headers)
        assert resp.status_code == 200
        assert "csv" in resp.json()
        assert resp.json()["total"] >= 2
