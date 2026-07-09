"""Tests for redeem-code endpoints (ADR-0007)."""

from httpx import AsyncClient

from app.models.redeem import RedeemCode, RedeemStatus


class TestGenerateCodes:
    async def test_generate_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/redeem-codes/generate",
            headers=auth_headers,
            json={"count": 5, "plan": "pro", "duration_days": 30},
        )
        assert resp.status_code == 403

    async def test_generate_as_admin(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 3, "plan": "pro", "duration_days": 30, "batch_label": "test-batch"},
        )
        assert resp.status_code == 200
        codes = resp.json()
        assert len(codes) == 3
        for c in codes:
            assert len(c["code"]) == 12  # XXXX-XXXX-XX
            assert c["status"] == "unused"
            assert c["revoked_reason"] is None
            assert c["expires_at"] is not None  # set at generation

    async def test_generate_without_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/redeem-codes/generate",
            json={"count": 1, "plan": "pro", "duration_days": 30},
        )
        assert resp.status_code == 401


class TestRedeemCode:
    async def _generate_code(self, client: AsyncClient, admin_headers: dict) -> str:
        resp = await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 1, "plan": "pro", "duration_days": 30},
        )
        return resp.json()[0]["code"]

    async def test_redeem_upgrades_user(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        code = await self._generate_code(client, admin_headers)

        resp = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["plan"] == "pro"
        assert data["plan_expires_at"] is not None  # new expiry surfaced (ADR-0007 UX)

        # Verify user is now Pro.
        me = await client.get("/api/v1/users/me", headers=auth_headers)
        assert me.json()["plan"] == "pro"

    async def test_redeem_invalid_code(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": "INVALID-CODE"},
        )
        assert resp.status_code == 404

    async def test_redeem_already_redeemed_code(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        from app.core.security import create_token
        from app.models.user import PlanType, RoleType, User
        from tests.conftest import TestSessionLocal, hash_password

        code = await self._generate_code(client, admin_headers)

        # First redeem - success.
        await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code},
        )

        # Create another user directly in DB and try to use same code.
        async with TestSessionLocal() as db:
            other = User(
                phone="13800138020",
                hashed_password=hash_password("Anotherpass1!"),
                name="Other",
                plan=PlanType.free,
                role=RoleType.user,
            )
            db.add(other)
            await db.commit()
            await db.refresh(other)
            token = create_token(other.id)

        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=headers,
            json={"code": code},
        )
        assert resp.status_code == 400
        assert "already been used" in resp.json()["detail"]

    async def test_redeem_revoked_code(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        """A revoked code cannot be redeemed (friendly error)."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            from sqlalchemy import select

            code = await self._generate_code(client, admin_headers)
            result = await db.execute(select(RedeemCode).where(RedeemCode.code == code))
            row = result.scalar_one()
            row.status = RedeemStatus.revoked
            await db.commit()

        resp = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code},
        )
        assert resp.status_code == 400
        assert "revoked" in resp.json()["detail"]

    async def test_redeem_expired_code(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        """An expired code cannot be redeemed (friendly error)."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            from sqlalchemy import select

            code = await self._generate_code(client, admin_headers)
            result = await db.execute(select(RedeemCode).where(RedeemCode.code == code))
            row = result.scalar_one()
            row.status = RedeemStatus.expired
            await db.commit()

        resp = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code},
        )
        assert resp.status_code == 400
        assert "expired" in resp.json()["detail"]

    async def test_redeem_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/redeem-codes/redeem",
            json={"code": "TEST-CODE-01"},
        )
        assert resp.status_code == 401


class TestListAndExport:
    async def test_list_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/redeem-codes", headers=auth_headers)
        assert resp.status_code == 403

    async def test_export_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/redeem-codes/export", headers=auth_headers)
        assert resp.status_code == 403

    async def test_list_as_admin(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get("/api/v1/redeem-codes", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        # The list endpoint returns a paginated dict, not a bare list.
        assert isinstance(data, dict)
        assert "items" in data
        assert isinstance(data["items"], list)

    async def test_list_filter_by_status(self, client: AsyncClient, admin_headers: dict):
        await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 2, "plan": "pro", "duration_days": 30},
        )
        resp = await client.get("/api/v1/redeem-codes?status=unused", headers=admin_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 2
        assert all(c["status"] == "unused" for c in items)

    async def test_export_as_admin(self, client: AsyncClient, admin_headers: dict):
        await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 2, "plan": "pro", "duration_days": 30},
        )
        resp = await client.get("/api/v1/redeem-codes/export", headers=admin_headers)
        assert resp.status_code == 200
        assert "csv" in resp.json()
        assert resp.json()["total"] >= 2


class TestRevokeAndRefund:
    async def _generate_one(self, client: AsyncClient, admin_headers: dict) -> dict:
        resp = await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 1, "plan": "pro", "duration_days": 30},
        )
        return resp.json()[0]

    async def test_revoke_unused_code(self, client: AsyncClient, admin_headers: dict):
        code = await self._generate_one(client, admin_headers)

        resp = await client.post(
            f"/api/v1/redeem-codes/{code['id']}/revoke",
            headers=admin_headers,
            json={"reason": "leak"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["status"] == "revoked"

        # The revoked code can no longer be redeemed.
        redeem = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=admin_headers,
            json={"code": code["code"]},
        )
        assert redeem.status_code == 400

    async def test_revoke_non_unused_code_fails(self, client: AsyncClient, admin_headers: dict, auth_headers: dict):
        """Revoke is only for unused codes; revoking a redeemed code is a refund."""
        code = await self._generate_one(client, admin_headers)
        # Redeem it first.
        await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code["code"]},
        )
        resp = await client.post(
            f"/api/v1/redeem-codes/{code['id']}/revoke",
            headers=admin_headers,
            json={"reason": "leak"},
        )
        assert resp.status_code == 400

    async def test_revoke_requires_admin(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        code = await self._generate_one(client, admin_headers)
        resp = await client.post(
            f"/api/v1/redeem-codes/{code['id']}/revoke",
            headers=auth_headers,
            json={"reason": "leak"},
        )
        assert resp.status_code == 403

    async def test_refund_redeemed_code_downgrades_user(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        """Refund claws back the days and downgrades the user to free (full clawback)."""
        code = await self._generate_one(client, admin_headers)

        # User redeems -> Pro for 30 days.
        redeem = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code["code"]},
        )
        assert redeem.status_code == 200
        me = await client.get("/api/v1/users/me", headers=auth_headers)
        assert me.json()["plan"] == "pro"

        # Admin refunds -> code revoked + user back to free (only code, full clawback).
        resp = await client.post(
            f"/api/v1/redeem-codes/{code['id']}/refund",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["plan"] == "free"
        assert data["plan_expires_at"] is None

        # User is now free again.
        me2 = await client.get("/api/v1/users/me", headers=auth_headers)
        assert me2.json()["plan"] == "free"

        # The refunded code is now revoked, and cannot be re-redeemed.
        redeem2 = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code["code"]},
        )
        assert redeem2.status_code == 400

    async def test_refund_unused_code_fails(self, client: AsyncClient, admin_headers: dict):
        """Refund is only for redeemed codes; an unused code has nothing to claw back."""
        code = await self._generate_one(client, admin_headers)
        resp = await client.post(
            f"/api/v1/redeem-codes/{code['id']}/refund",
            headers=admin_headers,
        )
        assert resp.status_code == 400

    async def test_refund_requires_admin(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        code = await self._generate_one(client, admin_headers)
        # Redeem first so it's in a refundable state.
        await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code["code"]},
        )
        resp = await client.post(
            f"/api/v1/redeem-codes/{code['id']}/refund",
            headers=auth_headers,
        )
        assert resp.status_code == 403
