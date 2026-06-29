"""Tests for payment endpoints."""

import pytest
from httpx import AsyncClient


@pytest.fixture
def enable_payments(monkeypatch):
    """Temporarily flip ``payments_enabled`` on for legacy in-site payment flow tests.

    ICP 合规默认禁用站内支付（create-order 返回 451）。这些 legacy 测试覆盖
    "支付开启时"的真实建单/mock 支付流程，故需临时打开开关。
    """
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "payments_enabled", True)


class TestCreateOrder:
    async def test_create_order_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/payments/create-order")
        assert resp.status_code == 401

    async def test_create_order_disabled_by_default(self, client: AsyncClient, auth_headers: dict):
        # ICP 合规：payments_enabled 默认 False，create-order 返回 451 合规提示。
        resp = await client.post(
            "/api/v1/payments/create-order",
            headers=auth_headers,
            params={"plan": "pro_monthly"},
        )
        assert resp.status_code == 451
        assert "不支持在线支付" in resp.json()["detail"]

    async def test_create_order_for_free_user(self, client: AsyncClient, auth_headers: dict, enable_payments):
        resp = await client.post(
            "/api/v1/payments/create-order",
            headers=auth_headers,
            params={"plan": "pro_monthly"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "order_id" in data
        assert data["amount"] == 3900
        assert data["currency"] == "CNY"

    async def test_create_order_pro_user_blocked(self, client: AsyncClient, admin_headers: dict, enable_payments):
        # Admin is already Pro
        resp = await client.post(
            "/api/v1/payments/create-order",
            headers=admin_headers,
            params={"plan": "pro_monthly"},
        )
        assert resp.status_code == 400
        assert "already" in resp.json()["detail"].lower()

    async def test_create_order_invalid_plan(self, client: AsyncClient, auth_headers: dict, enable_payments):
        resp = await client.post(
            "/api/v1/payments/create-order",
            headers=auth_headers,
            params={"plan": "nonexistent_plan"},
        )
        assert resp.status_code == 400
        assert "invalid plan" in resp.json()["detail"].lower()


class TestMockPay:
    async def test_mock_pay_upgrades_user(self, client: AsyncClient, auth_headers: dict, enable_payments):
        # Create order
        order = await client.post(
            "/api/v1/payments/create-order",
            headers=auth_headers,
            params={"plan": "pro_monthly"},
        )
        order_id = order.json()["order_id"]

        # Mock pay
        resp = await client.get(
            "/api/v1/payments/mock-pay",
            headers=auth_headers,
            params={"order_id": order_id},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify user is now Pro
        me = await client.get("/api/v1/users/me", headers=auth_headers)
        assert me.json()["plan"] == "pro"

    async def test_mock_pay_invalid_order(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get(
            "/api/v1/payments/mock-pay",
            headers=auth_headers,
            params={"order_id": "spk_nonexistent"},
        )
        assert resp.status_code == 404


class TestPaymentStatus:
    async def test_status_free_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/payments/status", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["plan"] == "free"
        assert resp.json()["is_pro"] is False


class TestVocabulary:
    async def test_add_word(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/vocabulary",
            headers=auth_headers,
            params={"word": "serendipity", "context_sentence": "It was pure serendipity."},
        )
        assert resp.status_code == 201
        assert resp.json()["word"] == "serendipity"

    async def test_add_duplicate_word(self, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/v1/vocabulary",
            headers=auth_headers,
            params={"word": "hello"},
        )
        resp = await client.post(
            "/api/v1/vocabulary",
            headers=auth_headers,
            params={"word": "hello"},
        )
        assert resp.status_code == 400

    async def test_list_vocabulary(self, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/v1/vocabulary",
            headers=auth_headers,
            params={"word": "example"},
        )
        resp = await client.get("/api/v1/vocabulary", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        # The vocabulary list endpoint returns a paginated dict with stats
        assert isinstance(data, dict)
        assert data["stats"]["total"] >= 1
        assert isinstance(data["words"], list)
        assert len(data["words"]) >= 1

    async def test_review_word(self, client: AsyncClient, auth_headers: dict):
        # Add word
        resp = await client.post(
            "/api/v1/vocabulary",
            headers=auth_headers,
            params={"word": "reviewable"},
        )
        word_id = resp.json()["id"]

        # Review
        resp = await client.post(
            f"/api/v1/vocabulary/{word_id}/review",
            headers=auth_headers,
            params={"quality": 5},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "next_review_at" in data
        assert data["review_count"] == 1

    async def test_delete_word(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/vocabulary",
            headers=auth_headers,
            params={"word": "delete-me"},
        )
        word_id = resp.json()["id"]

        resp = await client.delete(
            f"/api/v1/vocabulary/{word_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True
