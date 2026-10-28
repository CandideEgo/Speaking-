"""Tests for the admin 金数据 payment surface (PART A: revenue visibility).

Covers the two read-only endpoints (list + summary), the enqueue-only sync
endpoint, filters/summary math, and the ADM-06 switch of ``recent_activity``
from the dead legacy ``orders`` table to ``jinshuju_payments``.

The legacy ``GET /admin/orders`` endpoint was removed together with
``AdminOrderRow`` / ``admin_service.list_admin_orders``; the OpenAPI removal
assertion lives in ``test_response_contract.py``.
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.models.jinshuju_payment import JinshujuPayment, JinshujuPaymentStatus
from app.models.user import PlanType, User

PAYMENTS = "/api/v1/admin/payments"
SUMMARY = "/api/v1/admin/payments/summary"
SYNC = "/api/v1/admin/payments/sync"


def _payment(
    *,
    serial_number: int,
    status: str = JinshujuPaymentStatus.APPLIED,
    phone: str | None = "13800138000",
    trade_no: str | None = "trade-no-1",
    tier_name: str | None = "月卡",
    amount_fen: int | None = 1990,
    duration_days: int | None = 30,
    entry_created_at: datetime | None = None,
    applied_at: datetime | None = None,
    user_id: str | None = None,
    payment_id: str | None = None,
    error_message: str | None = None,
) -> JinshujuPayment:
    return JinshujuPayment(
        id=payment_id or str(uuid.uuid4()),
        entry_token=f"entry-token-{serial_number}-{uuid.uuid4().hex[:8]}",
        serial_number=serial_number,
        form_token="ed8TXL",
        phone=phone,
        tier_name=tier_name,
        amount_fen=amount_fen,
        duration_days=duration_days,
        trade_status="TRADE_SUCCESS",
        trade_no=trade_no,
        payment_method="WX_PAY",
        status=status,
        error_message=error_message,
        user_id=user_id,
        entry_created_at=entry_created_at,
        applied_at=applied_at,
    )


async def _add_user(db, phone: str, name: str | None = None) -> User:
    user = User(phone=phone, name=name, plan=PlanType.free)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestAdminPaymentsAuth:
    async def test_list_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get(PAYMENTS, headers=auth_headers)
        assert resp.status_code == 403

    async def test_summary_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get(SUMMARY, headers=auth_headers)
        assert resp.status_code == 403

    async def test_sync_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(SYNC, headers=auth_headers)
        assert resp.status_code == 403

    async def test_anonymous_is_401(self, client: AsyncClient):
        assert (await client.get(PAYMENTS)).status_code == 401


class TestListAdminPayments:
    async def test_pagination_shape_and_total(self, client: AsyncClient, db_session, admin_headers: dict):
        now = datetime.now(UTC)
        for i in range(3):
            db_session.add(_payment(serial_number=100 + i, entry_created_at=now - timedelta(days=i), trade_no=f"T-{i}"))
        await db_session.commit()

        first = await client.get(PAYMENTS, params={"page": 1, "page_size": 2}, headers=admin_headers)
        assert first.status_code == 200
        body = first.json()
        assert body["page"] == 1
        assert body["page_size"] == 2
        assert body["has_more"] is True
        assert body["total"] == 3
        assert len(body["items"]) == 2

        second = await client.get(PAYMENTS, params={"page": 2, "page_size": 2}, headers=admin_headers)
        body2 = second.json()
        assert len(body2["items"]) == 1
        assert body2["has_more"] is False
        assert body2["total"] == 3

        item = first.json()["items"][0]
        for field in (
            "id",
            "entry_token",
            "serial_number",
            "phone",
            "user_id",
            "user_phone",
            "user_name",
            "tier_name",
            "amount_fen",
            "duration_days",
            "trade_status",
            "trade_no",
            "payment_method",
            "status",
            "error_message",
            "entry_created_at",
            "created_at",
            "applied_at",
        ):
            assert field in item, f"missing payment row field: {field}"
        # Never expose the external raw payload (contains buyer PII).
        assert "raw_json" not in item
        assert all("raw_json" not in row for row in body["items"])

    async def test_status_filter_and_invalid_value(self, client: AsyncClient, db_session, admin_headers: dict):
        db_session.add_all(
            [
                _payment(serial_number=1, status=JinshujuPaymentStatus.APPLIED),
                _payment(serial_number=2, status=JinshujuPaymentStatus.PENDING),
                _payment(serial_number=3, status=JinshujuPaymentStatus.IGNORED),
            ]
        )
        await db_session.commit()

        applied = await client.get(PAYMENTS, params={"status": "applied"}, headers=admin_headers)
        assert applied.status_code == 200
        assert applied.json()["total"] == 1
        assert applied.json()["items"][0]["status"] == "applied"

        bad = await client.get(PAYMENTS, params={"status": "bogus"}, headers=admin_headers)
        assert bad.status_code == 422
        assert bad.json()["code"] == "VALIDATION_ERROR"

    async def test_keyword_filters_and_escaping(self, client: AsyncClient, db_session, admin_headers: dict):
        db_session.add_all(
            [
                _payment(serial_number=1001, phone="13800138000", trade_no="TXN-ABC-1", tier_name="年卡"),
                _payment(serial_number=1002, phone="13700137000", trade_no="TXN-XYZ-2", tier_name="月卡"),
            ]
        )
        await db_session.commit()

        async def _total(params: dict) -> int:
            resp = await client.get(PAYMENTS, params=params, headers=admin_headers)
            assert resp.status_code == 200, resp.text
            return resp.json()["total"]

        assert await _total({"keyword": "138"}) == 1
        assert await _total({"keyword": "TXN-XYZ"}) == 1
        assert await _total({"keyword": "年卡"}) == 1
        assert await _total({"keyword": "1002"}) == 1  # numeric → exact serial match
        # LIKE metacharacters must be escaped, not act as wildcards (ADM-11).
        assert await _total({"keyword": "%"}) == 0
        assert await _total({"keyword": "_"}) == 0

    async def test_keyword_length_limit(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get(PAYMENTS, params={"keyword": "x" * 101}, headers=admin_headers)
        assert resp.status_code == 422

    async def test_long_numeric_keyword_is_not_treated_as_serial(
        self, client: AsyncClient, db_session, admin_headers: dict
    ):
        """An 11-digit phone must not be bound to the INTEGER serial column.

        Regression: the exact-serial branch used to run for any all-digit
        keyword, and Postgres rejected the 11-digit phone with
        "value out of int32 range" → 500 (SQLite does not range-check, so this
        test alone would not have caught it — the guard itself is the fix).
        """
        db_session.add(_payment(serial_number=2003, phone="13611116666"))
        await db_session.commit()

        resp = await client.get(PAYMENTS, params={"keyword": "13611116666"}, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_phone_fallback_when_user_not_linked(self, client: AsyncClient, db_session, admin_headers: dict):
        """A paid-but-not-yet-matched record still shows the buyer's phone."""
        await _add_user(db_session, "13900139111", name="Linked User")
        db_session.add(_payment(serial_number=2001, phone="13600136222", user_id=None))
        await db_session.commit()

        resp = await client.get(PAYMENTS, params={"keyword": "13600136222"}, headers=admin_headers)
        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert item["phone"] == "13600136222"
        assert item["user_id"] is None
        assert item["user_phone"] is None
        assert item["user_name"] is None

    async def test_linked_account_phone_takes_precedence(self, client: AsyncClient, db_session, admin_headers: dict):
        user = await _add_user(db_session, "13900139111", name="Linked User")
        db_session.add(_payment(serial_number=2002, phone="13600136222", user_id=user.id))
        await db_session.commit()

        resp = await client.get(PAYMENTS, headers=admin_headers)
        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert item["phone"] == "13900139111"  # account phone wins over form phone
        assert item["user_phone"] == "13900139111"
        assert item["user_name"] == "Linked User"

    async def test_stable_ordering(self, client: AsyncClient, db_session, admin_headers: dict):
        """entry_created_at DESC (NULLS LAST), then created_at DESC, then id DESC."""
        same = datetime(2026, 10, 1, 8, 0, 0)
        db_session.add_all(
            [
                _payment(serial_number=3001, entry_created_at=None, payment_id="00000000-0000-0000-0000-00000000000a"),
                _payment(serial_number=3002, entry_created_at=same, payment_id="00000000-0000-0000-0000-00000000000b"),
                _payment(serial_number=3003, entry_created_at=same, payment_id="00000000-0000-0000-0000-00000000000c"),
            ]
        )
        await db_session.commit()

        resp = await client.get(PAYMENTS, headers=admin_headers)
        assert resp.status_code == 200
        ids = [row["id"] for row in resp.json()["items"]]
        # Same timestamp → id DESC; NULL entry time sorts last.
        assert ids == [
            "00000000-0000-0000-0000-00000000000c",
            "00000000-0000-0000-0000-00000000000b",
            "00000000-0000-0000-0000-00000000000a",
        ]


class TestPaymentSummary:
    async def test_summary_math(self, client: AsyncClient, db_session, admin_headers: dict):
        now = datetime.now(UTC)
        db_session.add_all(
            [
                # applied today, 19.90
                _payment(
                    serial_number=4001,
                    amount_fen=1990,
                    entry_created_at=now - timedelta(hours=1),
                    applied_at=now - timedelta(minutes=30),
                ),
                # applied 5 days ago, 49.90
                _payment(
                    serial_number=4002,
                    amount_fen=4990,
                    entry_created_at=now - timedelta(days=5),
                    applied_at=now - timedelta(days=5),
                ),
                _payment(serial_number=4003, status=JinshujuPaymentStatus.PENDING, amount_fen=1990),
                _payment(serial_number=4004, status=JinshujuPaymentStatus.IGNORED, amount_fen=19990),
                _payment(serial_number=4005, status=JinshujuPaymentStatus.REFUNDED, amount_fen=4990),
                _payment(
                    serial_number=4006,
                    status=JinshujuPaymentStatus.ERROR,
                    amount_fen=None,
                    error_message="boom",
                ),
            ]
        )
        await db_session.commit()

        resp = await client.get(SUMMARY, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["applied"] == 2
        assert data["pending"] == 1
        assert data["ignored"] == 1
        assert data["refunded"] == 1
        assert data["error"] == 1
        # Revenue only counts applied records (refunded/pending excluded).
        assert data["paid_total_fen"] == 1990 + 4990
        assert data["paid_30d_fen"] == 1990 + 4990
        assert data["paid_today_fen"] == 1990
        assert data["applied_today"] == 1

    async def test_empty_summary_is_all_zero(self, client: AsyncClient, admin_headers: dict):
        resp = await client.get(SUMMARY, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == {
            "applied": 0,
            "pending": 0,
            "ignored": 0,
            "refunded": 0,
            "error": 0,
            "paid_total_fen": 0,
            "paid_30d_fen": 0,
            "paid_today_fen": 0,
            "applied_today": 0,
        }


class TestPaymentSync:
    async def test_sync_returns_not_queued_when_unconfigured(
        self, client: AsyncClient, admin_headers: dict, monkeypatch
    ):
        # The local backend/.env may carry real JINSHUJU_* values; force the
        # disabled/unconfigured state so the assertion is environment-free.
        from app.core.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "jinshuju_enabled", False)
        monkeypatch.setattr(settings, "jinshuju_access_token", "")
        monkeypatch.setattr(settings, "jinshuju_form_token", "")

        resp = await client.post(SYNC, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == {"queued": False}

    async def test_sync_returns_not_queued_when_no_access_token(
        self, client: AsyncClient, admin_headers: dict, monkeypatch
    ):
        from app.core.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "jinshuju_enabled", True)
        monkeypatch.setattr(settings, "jinshuju_access_token", "")
        monkeypatch.setattr(settings, "jinshuju_form_token", "ed8TXL")

        resp = await client.post(SYNC, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == {"queued": False}

    async def test_sync_enqueues_celery_task_when_configured(
        self, client: AsyncClient, admin_headers: dict, monkeypatch, _mock_celery
    ):
        from app.core.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "jinshuju_enabled", True)
        monkeypatch.setattr(settings, "jinshuju_access_token", "test-access-token")
        monkeypatch.setattr(settings, "jinshuju_form_token", "ed8TXL")

        resp = await client.post(SYNC, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == {"queued": True}
        assert any("sync_jinshuju_payments" in name for name, _args, _kwargs in _mock_celery)


class TestRecentActivityPayment:
    async def test_recent_activity_reads_jinshuju_not_orders(
        self, client: AsyncClient, db_session, admin_headers: dict
    ):
        """ADM-06: payments in 最近动态 come from jinshuju_payments."""
        db_session.add(
            _payment(
                serial_number=5001,
                phone="13600136999",
                amount_fen=4990,
                tier_name="季卡",
                entry_created_at=datetime.now(UTC),
            )
        )
        await db_session.commit()

        resp = await client.get("/api/v1/admin/stats", headers=admin_headers)
        assert resp.status_code == 200
        payments = [a for a in resp.json()["recent_activity"] if a["type"] == "payment"]
        assert payments, "jinshuju payment should appear in recent_activity"
        assert "13600136999" in payments[0]["summary"]
        assert "开通 Pro" in payments[0]["summary"]
        assert "季卡" in payments[0]["summary"]

    async def test_pending_payment_shows_as_awaiting_grant(self, client: AsyncClient, db_session, admin_headers: dict):
        db_session.add(
            _payment(
                serial_number=5002,
                phone="13600136888",
                status=JinshujuPaymentStatus.PENDING,
                entry_created_at=datetime.now(UTC),
            )
        )
        await db_session.commit()

        resp = await client.get("/api/v1/admin/stats", headers=admin_headers)
        payments = [a for a in resp.json()["recent_activity"] if a["type"] == "payment"]
        assert payments
        assert "付款待开通" in payments[0]["summary"]


class TestNoRawJsonLeak:
    async def test_service_does_not_select_raw_json(self, db_session):
        """Defensive: the ORM row may hold raw_json, the response dict must not."""
        from app.services import admin_service

        db_session.add(_payment(serial_number=6001))
        await db_session.commit()

        result = await admin_service.list_admin_payments(db_session)
        assert result["total"] == 1
        assert all("raw_json" not in row for row in result["items"])
        # The stored row itself does keep raw_json for debugging.
        row = (await db_session.execute(select(JinshujuPayment.entry_token))).scalar_one()
        assert row
