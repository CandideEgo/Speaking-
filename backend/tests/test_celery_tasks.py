"""Direct-execution tests for Celery task bodies.

conftest stubs ``.delay`` / ``.apply_async`` so tasks never dispatch through a
broker; these tests call the task functions directly. The body runs through
``run_async`` on the shared celery-asyncio loop against the test database
(conftest routes ``async_session`` to the test session maker), so the
monetization / data-integrity logic (Pro downgrade, code expiry, order expiry,
reconciliation, scoring) is actually exercised instead of only existing in
production.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.order import Order, OrderStatus
from app.models.redeem import RedeemCode, RedeemStatus
from app.models.user import PlanType, RoleType, User
from app.models.video import Video, VideoSource, VideoStatus
from app.tasks.order_tasks import expire_pending_orders, reconcile_pending_orders
from app.tasks.redeem_tasks import downgrade_expired_pro, expire_unused_redeem_codes
from app.tasks.scoring_tasks import compute_top_scores


def _session_maker():
    """Resolve ``async_session`` lazily 鈥?a top-level import would capture the
    REAL engine at collection time (module __getattr__), before conftest
    routes it to the test session maker."""
    from app.core.database import async_session

    return async_session


async def _make_user(db, phone: str, *, plan=PlanType.free, expires_at=None):
    user = User(
        phone=phone,
        hashed_password="hashed",
        name="Task Test",
        plan=plan,
        plan_expires_at=expires_at,
        role=RoleType.user,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def test_downgrade_expired_pro_downgrades_only_expired():
    now = datetime.now(UTC)
    async with _session_maker()() as db:
        expired = await _make_user(db, "13800000001", plan=PlanType.pro, expires_at=now - timedelta(days=1))
        active = await _make_user(db, "13800000002", plan=PlanType.pro, expires_at=now + timedelta(days=1))
        free = await _make_user(db, "13800000003")
        ids = (expired.id, active.id, free.id)

    count = downgrade_expired_pro()

    async with _session_maker()() as db:
        users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars()}
        assert users[expired.id].plan == PlanType.free
        assert users[expired.id].plan_expires_at is None
        assert users[active.id].plan == PlanType.pro
        assert users[active.id].plan_expires_at is not None
        assert users[free.id].plan == PlanType.free
        assert count == 1


async def test_expire_unused_redeem_codes_only_stale_unused():
    now = datetime.now(UTC)
    async with _session_maker()() as db:
        stale = RedeemCode(
            code="STALE001", plan="pro", duration_days=30,
            status=RedeemStatus.unused, expires_at=now - timedelta(days=1),
        )
        fresh = RedeemCode(
            code="FRESH001", plan="pro", duration_days=30,
            status=RedeemStatus.unused, expires_at=now + timedelta(days=1),
        )
        used = RedeemCode(
            code="USED0001", plan="pro", duration_days=30,
            status=RedeemStatus.redeemed, expires_at=now - timedelta(days=1),
        )
        db.add_all([stale, fresh, used])
        await db.commit()
        codes = [c.code for c in (stale, fresh, used)]

    count = expire_unused_redeem_codes()

    async with _session_maker()() as db:
        rows = {c.code: c for c in (await db.execute(select(RedeemCode).where(RedeemCode.code.in_(codes)))).scalars()}
        assert rows["STALE001"].status == RedeemStatus.expired
        assert rows["FRESH001"].status == RedeemStatus.unused
        assert rows["USED0001"].status == RedeemStatus.redeemed
        assert count == 1


async def test_expire_pending_orders_only_stale_pending():
    now = datetime.now(UTC)
    async with _session_maker()() as db:
        user = await _make_user(db, "13800000004")
        old = Order(
            user_id=user.id, order_number="ORD-OLD-001", plan="pro_monthly", amount=990,
            status=OrderStatus.pending, created_at=now - timedelta(hours=2),
        )
        young = Order(
            user_id=user.id, order_number="ORD-YOUNG-01", plan="pro_monthly", amount=990,
            status=OrderStatus.pending, created_at=now - timedelta(minutes=5),
        )
        paid = Order(
            user_id=user.id, order_number="ORD-PAID-01", plan="pro_monthly", amount=990,
            status=OrderStatus.paid, created_at=now - timedelta(hours=2),
        )
        db.add_all([old, young, paid])
        await db.commit()
        numbers = [o.order_number for o in (old, young, paid)]

    count = expire_pending_orders()

    async with _session_maker()() as db:
        rows = {o.order_number: o for o in (await db.execute(select(Order).where(Order.order_number.in_(numbers)))).scalars()}
        assert rows["ORD-OLD-001"].status == OrderStatus.expired
        assert rows["ORD-YOUNG-01"].status == OrderStatus.pending
        assert rows["ORD-PAID-01"].status == OrderStatus.paid
        assert count == 1


async def test_reconcile_pending_orders_queries_provider(monkeypatch):
    """A provider answering 'still pending' must leave the order untouched 鈥?    the reconcile loop itself (row lock, re-check, provider call) is what we
    exercise here; the paid path is covered by the payment tests."""

    class _FakeProvider:
        def __init__(self) -> None:
            self.queried: list[str] = []

        async def query_order(self, order_number: str):
            self.queried.append(order_number)
            return OrderStatus.pending

    fake = _FakeProvider()
    import app.services.payment_provider as payment_provider

    monkeypatch.setattr(payment_provider, "get_payment_provider", lambda: fake)

    now = datetime.now(UTC)
    async with _session_maker()() as db:
        user = await _make_user(db, "13800000005")
        old = Order(
            user_id=user.id, order_number="ORD-REC-001", plan="pro_monthly", amount=990,
            status=OrderStatus.pending, created_at=now - timedelta(hours=2),
        )
        db.add(old)
        await db.commit()
        number = old.order_number

    count = reconcile_pending_orders()

    assert count == 0
    assert number in fake.queried


async def test_compute_top_scores_scores_ready_videos():
    async with _session_maker()() as db:
        video = Video(
            title="Score Me",
            source_url="https://example.com/v.mp4",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            review_status="published",
        )
        db.add(video)
        await db.commit()
        vid = video.id

    compute_top_scores(limit=10)  # must not raise

    async with _session_maker()() as db:
        row = (await db.execute(select(Video).where(Video.id == vid))).scalars().first()
        assert row is not None
        assert row.score_updated_at is not None


