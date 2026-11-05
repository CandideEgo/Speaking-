"""Real PostgreSQL evidence for order/user locks and stale-session settlement."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.core.database import get_async_session_maker
from app.core.time_utils import to_aware_utc
from app.models.order import Order, OrderStatus
from app.models.user import PlanType, User
from app.services.order_service import settle_paid_order

pytestmark = pytest.mark.integration


async def seed(count):
    maker = get_async_session_maker()
    expires = datetime.now(UTC) + timedelta(days=10)
    async with maker() as db:
        user = User(phone="13800009813", name="PG Settlement", plan=PlanType.pro, plan_expires_at=expires)
        db.add(user)
        await db.flush()
        orders = [
            Order(
                user_id=user.id,
                order_number=f"PG-SETTLEMENT-{i}",
                plan="pro_monthly",
                amount=3900,
                status=OrderStatus.expired,
            )
            for i in range(count)
        ]
        db.add_all(orders)
        await db.commit()
        return user.id, [order.id for order in orders], expires


async def race(order_ids):
    """All transactions load unsettled state before either acquires locks."""
    ready = asyncio.Event()
    waiting = 0

    async def settle(oid):
        nonlocal waiting
        async with get_async_session_maker()() as db:
            loaded = await db.get(Order, oid)
            waiting += 1
            if waiting == len(order_ids):
                ready.set()
            await asyncio.wait_for(ready.wait(), timeout=5)
            applied = await settle_paid_order(db, loaded.id)
            await db.commit()
            return applied

    return await asyncio.wait_for(asyncio.gather(*(settle(oid) for oid in order_ids)), timeout=15)


async def test_same_order_concurrent_settlement_grants_exactly_one_term():
    uid, ids, expires = await seed(1)
    assert sum(await race([ids[0], ids[0]])) == 1
    async with get_async_session_maker()() as db:
        user = await db.get(User, uid)
        assert to_aware_utc(user.plan_expires_at) == expires + timedelta(days=30)
        assert (await db.get(Order, ids[0])).status == OrderStatus.paid


async def test_distinct_orders_concurrently_extend_same_user_without_lost_or_duplicate_term():
    uid, ids, expires = await seed(2)
    assert sum(await race(ids)) == 2
    async with get_async_session_maker()() as db:
        user = await db.get(User, uid)
        assert to_aware_utc(user.plan_expires_at) == expires + timedelta(days=60)
        for oid in ids:
            assert (await db.get(Order, oid)).status == OrderStatus.paid
