"""Settlement owns no commit; reconciliation can recover timed-out payments."""

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core import database
from app.core.time_utils import to_aware_utc
from app.models.order import Order, OrderStatus
from app.models.user import PlanType, User
from app.services import order_service, payment_provider


async def seed_order(db, *, status=OrderStatus.pending, plan="pro_monthly"):
    user = User(phone="13800009811", name="Settlement", plan=PlanType.free)
    db.add(user)
    await db.flush()
    order = Order(
        user_id=user.id,
        order_number="SETTLEMENT-1",
        plan=plan,
        amount=3900,
        status=status,
        created_at=datetime.now(UTC) - timedelta(hours=2),
    )
    db.add(order)
    await db.commit()
    return user, order


async def test_settlement_rolls_back_order_and_membership_together(db_session):
    user, order = await seed_order(db_session)
    uid, oid = user.id, order.id
    assert await order_service.settle_paid_order(db_session, oid)
    await db_session.rollback()
    assert (await db_session.get(Order, oid)).status == OrderStatus.pending
    user = await db_session.get(User, uid)
    assert user.plan == PlanType.free
    assert user.plan_expires_at is None


async def test_replay_refreshes_stale_order_and_does_not_extend_again(db_session):
    user, order = await seed_order(db_session)
    oid = order.id
    maker = database.get_async_session_maker()
    # Hold a previously loaded pending order in the first session's identity map.
    async with maker() as writer:
        assert await order_service.settle_paid_order(writer, oid)
        await writer.commit()
    assert not await order_service.settle_paid_order(db_session, oid)
    assert order.status == OrderStatus.paid
    await db_session.refresh(user)
    assert timedelta(days=29) < to_aware_utc(user.plan_expires_at) - datetime.now(UTC) <= timedelta(days=30)


@pytest.mark.parametrize("status", [OrderStatus.paid, OrderStatus.cancelled])
async def test_non_payable_orders_do_not_grant_membership(db_session, status):
    user, order = await seed_order(db_session, status=status)
    assert not await order_service.settle_paid_order(db_session, order.id)
    await db_session.commit()
    assert user.plan == PlanType.free


async def test_unknown_plan_fails_without_granting_default_month(db_session):
    user, order = await seed_order(db_session, plan="unknown")
    with pytest.raises(ValueError, match="unknown payment plan"):
        await order_service.settle_paid_order(db_session, order.id)
    await db_session.commit()
    assert user.plan == PlanType.free
    assert order.status == OrderStatus.pending


async def test_reconcile_recovers_expired_order_without_open_session_during_query(db_session, monkeypatch):
    user, order = await seed_order(db_session)
    uid, oid = user.id, order.id
    assert await order_service.expire_pending_orders() == 1
    maker = database.get_async_session_maker()
    open_sessions = 0

    @asynccontextmanager
    async def tracked_session():
        nonlocal open_sessions
        async with maker() as db:
            open_sessions += 1
            try:
                yield db
            finally:
                open_sessions -= 1

    class PaidProvider:
        async def query_order(self, number):
            assert open_sessions == 0
            return OrderStatus.paid

    monkeypatch.setattr(database, "async_session", tracked_session)
    monkeypatch.setattr(payment_provider, "get_payment_provider", PaidProvider)
    assert await order_service.reconcile_pending_orders() == 1
    assert await order_service.reconcile_pending_orders() == 0
    await db_session.refresh(order)
    await db_session.refresh(user)
    assert order.id == oid and order.status == OrderStatus.paid
    assert user.id == uid and user.plan == PlanType.pro


async def test_callback_winning_during_query_is_not_settled_twice(db_session, monkeypatch):
    user, order = await seed_order(db_session)
    oid = order.id
    maker = database.get_async_session_maker()

    class CallbackProvider:
        async def query_order(self, number):
            async with maker() as db:
                assert await order_service.settle_paid_order(db, oid)
                await db.commit()
            return OrderStatus.paid

    monkeypatch.setattr(payment_provider, "get_payment_provider", CallbackProvider)
    assert await order_service.reconcile_pending_orders() == 0
    await db_session.refresh(user)
    assert timedelta(days=29) < to_aware_utc(user.plan_expires_at) - datetime.now(UTC) <= timedelta(days=30)


async def test_reconciliation_pages_and_preserves_progress_after_one_order_fails(db_session, monkeypatch):
    user, first = await seed_order(db_session, status=OrderStatus.expired)
    second = Order(
        user_id=user.id,
        order_number="SETTLEMENT-2",
        plan="pro_yearly",
        amount=29900,
        status=OrderStatus.expired,
        created_at=first.created_at,
    )
    db_session.add(second)
    await db_session.commit()
    queried = []

    class IntermittentProvider:
        async def query_order(self, number):
            queried.append(number)
            if number == "SETTLEMENT-1":
                raise TimeoutError("provider unavailable")
            return OrderStatus.paid

    monkeypatch.setattr(payment_provider, "get_payment_provider", IntermittentProvider)
    monkeypatch.setattr(order_service, "RECONCILIATION_BATCH_SIZE", 1)
    assert await order_service.reconcile_pending_orders() == 1
    assert set(queried) == {"SETTLEMENT-1", "SETTLEMENT-2"}
    db_session.expire_all()
    statuses = dict((await db_session.execute(select(Order.order_number, Order.status))).all())
    assert statuses == {"SETTLEMENT-1": OrderStatus.expired, "SETTLEMENT-2": OrderStatus.paid}
