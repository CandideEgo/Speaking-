"""Postgres integration tests for Celery task bodies (D2 follow-up).

The in-memory SQLite suite cannot express row-locking semantics:
``with_for_update(skip_locked=True)`` is silently ignored by SQLite, so the
monetization tasks' lock-ordering behaviour — ``expire_pending_orders`` /
``reconcile_pending_orders`` / ``downgrade_expired_pro`` /
``expire_unused_redeem_codes`` racing between beats or workers — was never
actually exercised. These tests run the task bodies against a real Postgres
and assert the SKIP LOCKED behaviour that prevents double-processing in
production, plus the reconcile paid path (user actually upgraded to Pro).

Marked ``integration`` (see pytest.ini). They skip when no Postgres is
reachable; CI's backend job provisions one (``DATABASE_URL`` points at the
service Postgres), so they run for real there. Locally:

    docker compose -f docker-compose.dev.yml up -d db
    PG_TEST_URL=postgresql+asyncpg://seeword:seeword_dev@localhost:5432/seeword \\
        pytest tests/test_celery_tasks_pg.py -v

Notes:
- Task bodies execute on the shared celery-asyncio background loop via
  ``run_async``; the test body runs on the pytest loop. conftest's Postgres
  engine uses ``NullPool`` so every session opens a fresh loop-local
  connection (asyncpg connections are loop-bound).
- ``pytestmark = pytest.mark.integration`` routes these tests through the
  Postgres branch of conftest's ``_async_setup`` fixture.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.database import get_async_session_maker
from app.models.order import Order, OrderStatus
from app.models.redeem import RedeemCode, RedeemStatus
from app.models.user import PlanType, RoleType, User
from app.models.video import Video, VideoSource, VideoStatus
from app.tasks.order_tasks import expire_pending_orders, reconcile_pending_orders
from app.tasks.redeem_tasks import downgrade_expired_pro, expire_unused_redeem_codes
from app.tasks.scoring_tasks import compute_top_scores

pytestmark = pytest.mark.integration


def _session_maker():
    """Resolve the Postgres-routed session maker via the shared seam.

    conftest's integration branch monkeypatches ``async_session`` to the
    Postgres session maker; ``get_async_session_maker`` reads it at call time.
    """
    return get_async_session_maker()


async def _make_user(db, phone: str, *, plan=PlanType.free, expires_at=None):
    user = User(
        phone=phone,
        hashed_password="hashed",
        name="PG Task Test",
        plan=plan,
        plan_expires_at=expires_at,
        role=RoleType.user,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def test_expire_pending_orders_skips_locked_rows():
    """SKIP LOCKED passes over a row locked by another transaction.

    SQLite ignores ``with_for_update`` entirely; on Postgres the task's
    ``SELECT ... FOR UPDATE SKIP LOCKED`` must skip the row held by an open
    transaction — exactly the concurrent-beat scenario the task was built for.
    """
    now = datetime.now(UTC)
    async with _session_maker()() as db:
        user = await _make_user(db, "13800006001")
        locked = Order(
            user_id=user.id,
            order_number="ORD-LOCK-01",
            plan="pro_monthly",
            amount=990,
            status=OrderStatus.pending,
            created_at=now - timedelta(hours=2),
        )
        free = Order(
            user_id=user.id,
            order_number="ORD-FREE-01",
            plan="pro_monthly",
            amount=990,
            status=OrderStatus.pending,
            created_at=now - timedelta(hours=2),
        )
        db.add_all([locked, free])
        await db.commit()
        locked_num, free_num = locked.order_number, free.order_number

    # Hold an exclusive row lock on one order, then run the task: the locked
    # row must be skipped, the unlocked stale order must be expired.
    async with _session_maker()() as locker:
        await locker.execute(select(Order).where(Order.order_number == locked_num).with_for_update())
        count = expire_pending_orders()
        assert count == 1  # only the unlocked order was processed

    # Release the lock (rollback) — the skipped order is picked up next run.
    async with _session_maker()() as db:
        rows = {
            o.order_number: o.status
            for o in (await db.execute(select(Order).where(Order.order_number.in_([locked_num, free_num])))).scalars()
        }
        assert rows[locked_num] == OrderStatus.pending
        assert rows[free_num] == OrderStatus.expired

    count = expire_pending_orders()
    assert count == 1

    async with _session_maker()() as db:
        status = (await db.execute(select(Order.status).where(Order.order_number == locked_num))).scalar_one()
        assert status == OrderStatus.expired


async def test_expire_pending_orders_concurrent_no_double_expire():
    """Two beats racing must claim each row exactly once (sum of counts == N).

    Without row locking both transactions would see the same pending rows and
    double-process them; SKIP LOCKED guarantees disjoint claim sets.
    """
    now = datetime.now(UTC)
    n = 8
    async with _session_maker()() as db:
        user = await _make_user(db, "13800006002")
        orders = [
            Order(
                user_id=user.id,
                order_number=f"ORD-CONC-{i:04d}",
                plan="pro_monthly",
                amount=990,
                status=OrderStatus.pending,
                created_at=now - timedelta(hours=3),
            )
            for i in range(n)
        ]
        db.add_all(orders)
        await db.commit()
        numbers = [o.order_number for o in orders]

    import asyncio

    counts = await asyncio.gather(
        asyncio.to_thread(expire_pending_orders),
        asyncio.to_thread(expire_pending_orders),
    )
    assert sum(counts) == n

    async with _session_maker()() as db:
        rows = (await db.execute(select(Order).where(Order.order_number.in_(numbers)))).scalars().all()
        assert all(o.status == OrderStatus.expired for o in rows)


async def test_reconcile_pending_orders_upgrades_user_when_provider_says_paid(monkeypatch):
    """The reconcile money path really upgrades the user on Postgres.

    ``_process_successful_payment`` locks the user row, extends Pro and marks
    the order paid — the branch the SQLite suite could not assert end-to-end
    (it stubbed the provider to always answer "pending").
    """
    import app.services.payment_provider as payment_provider

    class _PaidProvider:
        def __init__(self) -> None:
            self.queried: list[str] = []

        async def query_order(self, order_number: str):
            self.queried.append(order_number)
            return OrderStatus.paid

    fake = _PaidProvider()
    monkeypatch.setattr(payment_provider, "get_payment_provider", lambda: fake)

    now = datetime.now(UTC)
    async with _session_maker()() as db:
        user = await _make_user(db, "13800006003", plan=PlanType.free)
        order = Order(
            user_id=user.id,
            order_number="ORD-REC-PAID",
            plan="pro_monthly",
            amount=990,
            status=OrderStatus.pending,
            created_at=now - timedelta(hours=2),
        )
        db.add(order)
        await db.commit()
        order_id, user_id = order.id, user.id

    count = reconcile_pending_orders()
    assert count == 1
    assert "ORD-REC-PAID" in fake.queried

    async with _session_maker()() as db:
        upgraded = await db.get(User, user_id)
        paid_order = await db.get(Order, order_id)
        assert upgraded.plan == PlanType.pro
        assert upgraded.plan_expires_at is not None
        assert paid_order.status == OrderStatus.paid
        assert paid_order.paid_at is not None


async def test_downgrade_expired_pro_skips_locked_user():
    """Same SKIP LOCKED guarantee for the Pro-downgrade sweep."""
    now = datetime.now(UTC)
    async with _session_maker()() as db:
        locked = await _make_user(db, "13800006004", plan=PlanType.pro, expires_at=now - timedelta(days=1))
        other = await _make_user(db, "13800006005", plan=PlanType.pro, expires_at=now - timedelta(days=1))
        locked_id, other_id = locked.id, other.id

    async with _session_maker()() as locker:
        await locker.execute(select(User).where(User.id == locked_id).with_for_update())
        count = downgrade_expired_pro()
        assert count == 1  # locked user skipped; only `other` downgraded

    assert downgrade_expired_pro() == 1  # lock released → now downgraded

    async with _session_maker()() as db:
        assert (await db.get(User, locked_id)).plan == PlanType.free
        assert (await db.get(User, other_id)).plan == PlanType.free


async def test_expire_unused_redeem_codes_and_downgrade_on_pg():
    """Parity of the redeem-code expiry + downgrade sweeps on real Postgres.

    Exercises enum columns (SAEnum), timezone-aware DateTime comparisons and
    the count contract against PG instead of SQLite.
    """
    now = datetime.now(UTC)
    async with _session_maker()() as db:
        expired = await _make_user(db, "13800006006", plan=PlanType.pro, expires_at=now - timedelta(days=1))
        active = await _make_user(db, "13800006007", plan=PlanType.pro, expires_at=now + timedelta(days=1))
        stale_code = RedeemCode(
            code="PG-STALE-01",
            plan="pro",
            duration_days=30,
            status=RedeemStatus.unused,
            expires_at=now - timedelta(days=1),
        )
        fresh_code = RedeemCode(
            code="PG-FRESH-01",
            plan="pro",
            duration_days=30,
            status=RedeemStatus.unused,
            expires_at=now + timedelta(days=1),
        )
        db.add_all([stale_code, fresh_code])
        await db.commit()
        expired_id, active_id = expired.id, active.id
        stale_code_id = stale_code.id

    assert downgrade_expired_pro() == 1
    assert expire_unused_redeem_codes() == 1

    async with _session_maker()() as db:
        assert (await db.get(User, expired_id)).plan == PlanType.free
        assert (await db.get(User, active_id)).plan == PlanType.pro
        assert (await db.get(RedeemCode, stale_code_id)).status == RedeemStatus.expired


async def test_compute_top_scores_scores_ready_videos_on_pg():
    """Scoring sweep runs on PG (BigInteger view_count, JSON columns)."""
    async with _session_maker()() as db:
        video = Video(
            title="PG Score Me",
            source_url="https://example.com/pg.mp4",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            review_status="published",
            view_count=5000,  # BigInteger column
            external_meta={"level": "CET-4"},  # JSON column
        )
        db.add(video)
        await db.commit()
        vid = video.id

    compute_top_scores(limit=10)  # must not raise on PG

    async with _session_maker()() as db:
        row = (await db.execute(select(Video).where(Video.id == vid))).scalars().first()
        assert row is not None
        assert row.score is not None
        assert row.score_updated_at is not None
