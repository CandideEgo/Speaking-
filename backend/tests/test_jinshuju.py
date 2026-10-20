"""金数据外部收款 → Pro 自动开通的测试。

覆盖：已付款开通、未付款忽略、金额不符拒绝、幂等、未注册手机号挂起后
登录补发、webhook 验签、定时同步，以及站内购买（x_field_1 签名 token）
零填写开通与购买链接接口。金数据 HTTP 层全部被替换成假数据，测试不联网。
"""

import base64
import hashlib
import hmac
import time
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import Base
from app.models.jinshuju_payment import JinshujuPayment, JinshujuPaymentStatus
from app.models.user import PlanType, User
from app.services import jinshuju_service

FORM_TOKEN = "ed8TXL"
WEBHOOK_SECRET = "test-webhook-secret"
PURCHASE_SECRET = "test-purchase-secret"


@pytest.fixture
def jinshuju_on(monkeypatch):
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "jinshuju_enabled", True)
    monkeypatch.setattr(settings, "jinshuju_access_token", "test-access-token")
    monkeypatch.setattr(settings, "jinshuju_form_token", FORM_TOKEN)
    monkeypatch.setattr(settings, "jinshuju_webhook_secret", WEBHOOK_SECRET)
    monkeypatch.setattr(settings, "jinshuju_tier_field", "field_2")
    monkeypatch.setattr(settings, "jinshuju_phone_field", "field_5")
    monkeypatch.setattr(settings, "jinshuju_purchase_url", "https://example.jsjform.com/p/ed8TXL")
    monkeypatch.setattr(settings, "jinshuju_purchase_token_secret", PURCHASE_SECRET)
    monkeypatch.setattr(settings, "jinshuju_purchase_token_ttl_minutes", 120)
    return settings


def _entry(
    *,
    serial_number: int = 1,
    token: str = "entry-token-1",
    trade_status: str = "TRADE_SUCCESS",
    tier: str = "月卡",
    price: float = 19.9,
    phone: str | None = "13800138000",
    x_field_1: str = "",
) -> dict:
    return {
        "token": token,
        "serial_number": serial_number,
        "form": FORM_TOKEN,
        "trade_status": trade_status,
        "trade_no": "trade-no-1",
        "payment_method": "WX_PAY",
        "total_price": price,
        "field_2": [{"name": tier, "number": 1, "price": price}],
        "field_5": phone,
        "x_field_1": x_field_1,
        "created_at": "2026-10-18T15:51:40.521Z",
    }


async def _make_user(db, phone: str) -> User:
    user = User(phone=phone, name="Buyer", plan=PlanType.free)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _aware(value: datetime) -> datetime:
    """SQLite 读回的 DateTime 会丢 tzinfo；比较前补成 UTC。"""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class TestProcessEntry:
    async def test_paid_entry_grants_pro(self, db_session, jinshuju_on):
        user = await _make_user(db_session, "13800138000")
        assert user.plan == PlanType.free

        outcome = await jinshuju_service.process_entry(db_session, _entry())

        assert outcome == "applied"
        await db_session.refresh(user)
        assert user.plan == PlanType.pro
        assert user.plan_source == "purchase"
        assert user.plan_expires_at is not None
        assert _aware(user.plan_expires_at) > datetime.now(UTC) + timedelta(days=29)
        record = (await db_session.execute(select(JinshujuPayment))).scalar_one()
        assert record.status == JinshujuPaymentStatus.APPLIED
        assert record.phone == "13800138000"
        assert record.amount_fen == 1990
        assert record.duration_days == 30
        assert record.user_id == user.id

    async def test_unpaid_entry_is_ignored(self, db_session, jinshuju_on):
        user = await _make_user(db_session, "13800138000")

        outcome = await jinshuju_service.process_entry(db_session, _entry(trade_status="WAIT_BUYER_PAY"))

        assert outcome == "not_paid"
        await db_session.refresh(user)
        assert user.plan == PlanType.free
        assert (await db_session.execute(select(JinshujuPayment))).scalar_one_or_none() is None

    async def test_amount_mismatch_does_not_grant(self, db_session, jinshuju_on):
        user = await _make_user(db_session, "13800138000")

        outcome = await jinshuju_service.process_entry(db_session, _entry(price=0.01))

        assert outcome == "amount_mismatch"
        await db_session.refresh(user)
        assert user.plan == PlanType.free
        record = (await db_session.execute(select(JinshujuPayment))).scalar_one()
        assert record.status == JinshujuPaymentStatus.IGNORED
        assert "不符" in (record.error_message or "")

    async def test_reprocess_is_idempotent(self, db_session, jinshuju_on):
        user = await _make_user(db_session, "13800138000")
        assert await jinshuju_service.process_entry(db_session, _entry()) == "applied"
        await db_session.refresh(user)
        first_expiry = user.plan_expires_at

        assert await jinshuju_service.process_entry(db_session, _entry()) == "already_applied"

        await db_session.refresh(user)
        assert user.plan_expires_at == first_expiry
        assert (await db_session.execute(select(JinshujuPayment))).scalars().all() != []

    async def test_different_tier_uses_its_duration(self, db_session, jinshuju_on):
        user = await _make_user(db_session, "13800138000")

        outcome = await jinshuju_service.process_entry(
            db_session, _entry(serial_number=2, token="entry-token-2", tier="季卡", price=49.9)
        )

        assert outcome == "applied"
        await db_session.refresh(user)
        remaining = _aware(user.plan_expires_at) - datetime.now(UTC)
        assert timedelta(days=89) < remaining < timedelta(days=91)

    async def test_refund_after_grant_is_recorded_without_clawback(self, db_session, jinshuju_on):
        user = await _make_user(db_session, "13800138000")
        assert await jinshuju_service.process_entry(db_session, _entry()) == "applied"
        await db_session.refresh(user)
        expiry = user.plan_expires_at

        outcome = await jinshuju_service.process_entry(db_session, _entry(trade_status="refunded"))

        assert outcome == "refunded"
        await db_session.refresh(user)
        assert user.plan == PlanType.pro
        assert user.plan_expires_at == expiry
        record = (await db_session.execute(select(JinshujuPayment))).scalar_one()
        assert record.status == JinshujuPaymentStatus.REFUNDED


class TestPendingGrant:
    async def test_pending_order_is_applied_on_first_login(self, db_session, jinshuju_on):
        outcome = await jinshuju_service.process_entry(db_session, _entry(token="entry-pending", phone="13911112222"))
        assert outcome == "pending"

        user = await _make_user(db_session, "13911112222")
        applied = await jinshuju_service.apply_pending_grants(db_session, user)

        assert applied == 1
        await db_session.refresh(user)
        assert user.plan == PlanType.pro
        record = (await db_session.execute(select(JinshujuPayment))).scalar_one()
        assert record.status == JinshujuPaymentStatus.APPLIED
        assert record.user_id == user.id

    async def test_apply_is_noop_for_other_phone(self, db_session, jinshuju_on):
        await jinshuju_service.process_entry(db_session, _entry(token="entry-pending", phone="13911112222"))
        user = await _make_user(db_session, "13800138000")

        assert await jinshuju_service.apply_pending_grants(db_session, user) == 0
        await db_session.refresh(user)
        assert user.plan == PlanType.free


class TestSync:
    async def test_sync_processes_paid_entries(self, db_session, jinshuju_on, monkeypatch):
        await _make_user(db_session, "13800138000")

        async def fake_fetch(created_at: str) -> list[dict]:
            assert created_at  # 回看窗口按北京时间传参
            return [
                _entry(),
                _entry(serial_number=2, token="entry-unpaid", trade_status="WAIT_BUYER_PAY"),
            ]

        monkeypatch.setattr(jinshuju_service, "fetch_recent_entries", fake_fetch)

        counts = await jinshuju_service.sync_recent_entries(db_session)

        assert counts["total"] == 2
        assert counts["applied"] == 1
        assert counts["not_paid"] == 1

    async def test_sync_skips_when_disabled(self, db_session, monkeypatch):
        from app.core.config import get_settings

        monkeypatch.setattr(get_settings(), "jinshuju_enabled", False)
        assert await jinshuju_service.sync_recent_entries(db_session) == {"skipped": "disabled"}


class TestWebhook:
    async def test_rejects_bad_secret(self, client: AsyncClient, jinshuju_on):
        resp = await client.post(
            "/api/v1/payments/jinshuju/webhook",
            params={"secret": "wrong"},
            json={"form": FORM_TOKEN, "entry": {"serial_number": 1}},
        )
        assert resp.status_code == 403

    async def test_rejects_when_disabled(self, client: AsyncClient, monkeypatch):
        from app.core.config import get_settings

        monkeypatch.setattr(get_settings(), "jinshuju_enabled", False)
        resp = await client.post(
            "/api/v1/payments/jinshuju/webhook",
            params={"secret": WEBHOOK_SECRET},
            json={"form": FORM_TOKEN, "entry": {"serial_number": 1}},
        )
        assert resp.status_code == 404

    async def test_rejects_unknown_form(self, client: AsyncClient, jinshuju_on):
        resp = await client.post(
            "/api/v1/payments/jinshuju/webhook",
            params={"secret": WEBHOOK_SECRET},
            json={"form": "OTHER", "entry": {"serial_number": 1}},
        )
        assert resp.status_code == 400

    async def test_enqueues_processing_without_trusting_payload(self, client: AsyncClient, jinshuju_on, monkeypatch):
        resp = await client.post(
            "/api/v1/payments/jinshuju/webhook",
            params={"secret": WEBHOOK_SECRET},
            json={
                "form": FORM_TOKEN,
                "entry": {"serial_number": 7, "trade_status": "TRADE_SUCCESS", "total_price": 19.9},
            },
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
        calls = getattr(monkeypatch, "_celery_calls", [])
        assert any(name.endswith("process_jinshuju_entry") and args == (7,) for name, args, _ in calls)


class TestSchema:
    def test_table_registered(self):
        assert "jinshuju_payments" in Base.metadata.tables


class TestPurchaseToken:
    def test_roundtrip(self, jinshuju_on):
        token = jinshuju_service.create_purchase_token("user-abc")
        assert jinshuju_service.verify_purchase_token(token) == "user-abc"

    def test_tamper_is_rejected(self, jinshuju_on):
        token = jinshuju_service.create_purchase_token("user-abc")
        tampered = token[:-4] + ("AAAA" if token[-4:] != "AAAA" else "BBBB")
        assert jinshuju_service.verify_purchase_token(tampered) is None

    def test_expired_is_rejected(self, jinshuju_on):
        user_id = "user-abc"
        payload = f"{user_id}.{int(time.time()) - 10}"
        digest = hmac.new(PURCHASE_SECRET.encode(), payload.encode(), hashlib.sha256).digest()[:16]
        signature = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        assert jinshuju_service.verify_purchase_token(f"{payload}.{signature}") is None

    def test_garbage_is_rejected(self, jinshuju_on):
        assert jinshuju_service.verify_purchase_token("") is None
        assert jinshuju_service.verify_purchase_token("a.b") is None
        assert jinshuju_service.verify_purchase_token("not-a-token") is None


class TestPurchaseFlow:
    """站内购买（B 方案）：只靠 x_field_1 的签名 token 就能开通，不需要手机号。"""

    async def test_token_grants_without_phone(self, db_session, jinshuju_on):
        user = await _make_user(db_session, "13800138000")
        token = jinshuju_service.create_purchase_token(user.id)

        outcome = await jinshuju_service.process_entry(
            db_session, _entry(token="entry-token-b", phone=None, x_field_1=token)
        )

        assert outcome == "applied"
        await db_session.refresh(user)
        assert user.plan == PlanType.pro
        assert user.plan_source == "purchase"
        record = (await db_session.execute(select(JinshujuPayment))).scalar_one()
        assert record.user_id == user.id
        assert record.phone is None

    async def test_missing_token_and_phone_is_ignored(self, db_session, jinshuju_on):
        await _make_user(db_session, "13800138000")

        outcome = await jinshuju_service.process_entry(
            db_session, _entry(token="entry-token-c", phone=None, x_field_1="")
        )

        assert outcome == "ignored"
        record = (await db_session.execute(select(JinshujuPayment))).scalar_one()
        assert record.status == JinshujuPaymentStatus.IGNORED
        assert "购买标识" in (record.error_message or "")

    async def test_token_for_unknown_user_is_ignored(self, db_session, jinshuju_on):
        token = jinshuju_service.create_purchase_token("deleted-user-id")

        outcome = await jinshuju_service.process_entry(
            db_session, _entry(token="entry-token-d", phone=None, x_field_1=token)
        )

        assert outcome == "ignored"
        record = (await db_session.execute(select(JinshujuPayment))).scalar_one()
        assert record.status == JinshujuPaymentStatus.IGNORED
        assert "不存在" in (record.error_message or "")

    async def test_tampered_token_falls_back_to_nothing(self, db_session, jinshuju_on):
        user = await _make_user(db_session, "13800138000")
        good = jinshuju_service.create_purchase_token(user.id)
        bad = good[:-4] + ("AAAA" if good[-4:] != "AAAA" else "BBBB")

        outcome = await jinshuju_service.process_entry(
            db_session, _entry(token="entry-token-e", phone=None, x_field_1=bad)
        )

        assert outcome == "ignored"
        await db_session.refresh(user)
        assert user.plan == PlanType.free


class TestPurchaseLinkEndpoint:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/payments/jinshuju/purchase-link")
        assert resp.status_code == 401

    async def test_returns_signed_url_and_tiers(self, client: AsyncClient, auth_headers: dict, jinshuju_on):
        resp = await client.get("/api/v1/payments/jinshuju/purchase-link", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"].startswith("https://example.jsjform.com/p/ed8TXL?")
        assert "x_field_1=" in data["url"]
        assert data["expires_in_seconds"] == 120 * 60
        assert [tier["name"] for tier in data["tiers"]] == ["月卡", "季卡", "年卡"]
        assert data["tiers"][0]["price_fen"] == 1990

    async def test_unavailable_when_disabled(self, client: AsyncClient, auth_headers: dict, monkeypatch):
        from app.core.config import get_settings

        monkeypatch.setattr(get_settings(), "jinshuju_enabled", False)
        resp = await client.get("/api/v1/payments/jinshuju/purchase-link", headers=auth_headers)
        assert resp.status_code == 503

    async def test_unavailable_without_purchase_url(
        self, client: AsyncClient, auth_headers: dict, jinshuju_on, monkeypatch
    ):
        monkeypatch.setattr(jinshuju_on, "jinshuju_purchase_url", "")
        resp = await client.get("/api/v1/payments/jinshuju/purchase-link", headers=auth_headers)
        assert resp.status_code == 503
