"""Tests for presence heartbeat + admin stats real-time KPIs (DEV-FLOW B2)."""

from httpx import AsyncClient


class TestPresenceHeartbeat:
    async def test_heartbeat_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/presence/heartbeat")
        assert resp.status_code == 401

    async def test_heartbeat_ok(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/v1/presence/heartbeat", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    async def test_heartbeat_counts_as_online(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        """A heartbeat sets presence:{uid}; admin stats reflects online_now >= 1."""
        resp = await client.post("/api/v1/presence/heartbeat", headers=auth_headers)
        assert resp.status_code == 200

        stats = await client.get("/api/v1/admin/stats", headers=admin_headers)
        assert stats.status_code == 200
        data = stats.json()
        assert data["online_now"] >= 1


class TestAdminStatsNewKpis:
    async def test_stats_has_new_fields(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get("/api/v1/admin/stats", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        for k in (
            "online_now",
            "gpu_queue_depth",
            "videos_error_count",
            "signups_today",
            "redeems_today",
        ):
            assert k in data, f"missing KPI field: {k}"
            assert isinstance(data[k], int)

    async def test_stats_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/admin/stats", headers=auth_headers)
        assert resp.status_code == 403

    async def test_redeems_today_counts_redeemed_codes(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        """Redeeming a code bumps redeems_today (used_at is today)."""
        # Generate + redeem one code.
        gen = await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 1, "plan": "pro", "duration_days": 30},
        )
        code = gen.json()[0]["code"]
        redeem = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers=auth_headers,
            json={"code": code},
        )
        assert redeem.status_code == 200

        stats = await client.get("/api/v1/admin/stats", headers=admin_headers)
        assert stats.json()["redeems_today"] >= 1
