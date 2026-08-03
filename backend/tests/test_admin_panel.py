"""Tests for the admin-panel alignment endpoints (prototypes 24-32).

Covers: settings singleton (GET/PUT), admin account list, redemption
records (订单管理), redeem-code summary + keyword search, user list
expired filter / learned_words, and stats funnel/topic extensions.
"""

from httpx import AsyncClient


class TestAdminSettings:
    async def test_settings_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/admin/settings", headers=auth_headers)
        assert resp.status_code == 403

    async def test_settings_defaults(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get("/api/v1/admin/settings", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["site_name"] == "SeeWord"
        assert data["payments_enabled"] is False  # non-commercial platform
        assert data["registration_enabled"] is True
        assert data["quality_block_enabled"] is True
        assert data["quality_block_threshold"] == 0.6
        assert data["quality_warn_threshold"] == 0.8
        assert data["translate_timeout_sec"] == 1800
        assert data["download_timeout_sec"] == 3600

    async def test_settings_partial_update(self, client: AsyncClient, admin_headers: dict):
        resp = await client.put(
            "/api/v1/admin/settings",
            headers=admin_headers,
            json={"site_name": "SeeWord Beta", "quality_warn_threshold": 0.85},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["site_name"] == "SeeWord Beta"
        assert data["quality_warn_threshold"] == 0.85
        # untouched fields keep their previous value
        assert data["payments_enabled"] is False

        # persisted across requests
        again = await client.get("/api/v1/admin/settings", headers=admin_headers)
        assert again.json()["site_name"] == "SeeWord Beta"

    async def test_settings_threshold_validation(self, client: AsyncClient, admin_headers: dict):
        resp = await client.put(
            "/api/v1/admin/settings",
            headers=admin_headers,
            json={"quality_warn_threshold": 0.3, "quality_block_threshold": 0.6},
        )
        assert resp.status_code == 400


class TestAdminAccounts:
    async def test_list_admin_accounts(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get("/api/v1/admin/admins", headers=admin_headers)
        assert resp.status_code == 200
        accounts = resp.json()
        assert isinstance(accounts, list)
        assert len(accounts) >= 1
        assert accounts[0]["name"] == "Admin"
        assert accounts[0]["phone"] == "13900139000"


class TestRedemptions:
    async def _redeem_one(self, client: AsyncClient, admin_headers: dict, auth_headers: dict) -> str:
        gen = await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 1, "plan": "pro", "duration_days": 30},
        )
        code = gen.json()[0]["code"]
        resp = await client.post("/api/v1/redeem-codes/redeem", headers=auth_headers, json={"code": code})
        assert resp.status_code == 200
        return code

    async def test_list_redemptions(self, client: AsyncClient, admin_headers: dict, auth_headers: dict):
        code = await self._redeem_one(client, admin_headers, auth_headers)

        resp = await client.get("/api/v1/admin/redemptions", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        item = next(r for r in data["items"] if r["code"] == code)
        assert item["status"] == "redeemed"
        assert item["user_phone"] is not None  # joined from users table
        assert item["duration_days"] == 30

    async def test_redemption_summary_and_filters(self, client: AsyncClient, admin_headers: dict, auth_headers: dict):
        await self._redeem_one(client, admin_headers, auth_headers)

        summary = await client.get("/api/v1/admin/redemptions/summary", headers=admin_headers)
        assert summary.status_code == 200
        counts = summary.json()
        assert counts["redeemed"] >= 1
        assert counts["refunded"] == 0

        # refunded filter returns nothing yet
        refunded = await client.get("/api/v1/admin/redemptions?status=refunded", headers=admin_headers)
        assert refunded.json()["total"] == 0

    async def test_redemptions_keyword_search(self, client: AsyncClient, admin_headers: dict, auth_headers: dict):
        code = await self._redeem_one(client, admin_headers, auth_headers)

        resp = await client.get(f"/api/v1/admin/redemptions?keyword={code.lower()}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_redemptions_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/admin/redemptions", headers=auth_headers)
        assert resp.status_code == 403


class TestRedeemCodesSummaryAndKeyword:
    async def test_summary_counts(self, client: AsyncClient, admin_headers: dict):
        await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 2, "plan": "pro", "duration_days": 30},
        )
        resp = await client.get("/api/v1/redeem-codes/summary", headers=admin_headers)
        assert resp.status_code == 200
        counts = resp.json()
        assert counts["unused"] >= 2
        assert counts["redeemed"] == 0

    async def test_keyword_search(self, client: AsyncClient, admin_headers: dict):
        gen = await client.post(
            "/api/v1/redeem-codes/generate",
            headers=admin_headers,
            json={"count": 2, "plan": "pro", "duration_days": 30},
        )
        first_code = gen.json()[0]["code"]

        resp = await client.get(f"/api/v1/redeem-codes?keyword={first_code.lower()}", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["code"] == first_code


class TestAdminUsersEnhanced:
    async def test_learned_words_present(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get("/api/v1/admin/users", headers=admin_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 1
        for item in items:
            assert "learned_words" in item

    async def test_expired_filter(self, client: AsyncClient, admin_headers: dict):
        """No expired-Pro users in a fresh test DB — filter must return zero rows."""
        resp = await client.get("/api/v1/admin/users?plan=expired", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestAdminStatsEnhanced:
    async def test_stats_new_fields(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get("/api/v1/admin/stats", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pro_expired_count"] >= 0
        assert isinstance(data["videos_by_topic"], list)
        funnel = data["funnel"]
        assert {"registered", "watched", "vocab_saved", "pro"} <= set(funnel.keys())
        assert funnel["registered"] >= 1
