"""Order settlement shared by HTTP callbacks and reconciliation workers.

Settlement only flushes: its caller owns the transaction. Provider queries run
outside database transactions; each reconciliation result settles independently.
"""

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session_maker
from app.core.time_utils import to_aware_utc
from app.models.order import Order, OrderStatus
from app.models.user import PlanType, User
from app.services import payment_provider
from app.services.payment_provider import PLAN_DURATIONS

logger = structlog.get_logger()
PAYABLE_STATUSES = (OrderStatus.pending, OrderStatus.expired)
RECONCILIATION_BATCH_SIZE = 100


async def settle_paid_order(db: AsyncSession, order_id: str) -> bool:
    """Apply verified payment once, including a locally timed-out order.

    Callers own payment verification: HTTP callbacks check signature and amount;
    legacy reconciliation can only consume the provider's status-only result
    (see its limitations below). Lock order is always order -> user. Reloading
    both rows prevents a stale identity map from granting the same term twice.
    """
    order = (
        await db.execute(
            select(Order).where(Order.id == order_id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if order is None or order.status not in PAYABLE_STATUSES:
        return False
    duration_days = PLAN_DURATIONS.get(order.plan)
    if duration_days is None:
        raise ValueError("Cannot settle an unknown payment plan")
    user = (
        await db.execute(
            select(User).where(User.id == order.user_id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if user is None:
        raise ValueError("Cannot settle an order without its account")
    now = datetime.now(UTC)
    current_expires = to_aware_utc(user.plan_expires_at) if user.plan_expires_at else now
    user.plan = PlanType.pro
    user.plan_expires_at = max(current_expires, now) + timedelta(days=duration_days)
    order.status = OrderStatus.paid
    order.paid_at = now
    await db.flush()
    return True


async def expire_pending_orders() -> int:
    """Local timeout does not erase an order's eligibility for reconciliation."""
    cutoff = datetime.now(UTC) - timedelta(minutes=30)
    async with get_async_session_maker()() as db:
        orders = (
            await db.execute(
                select(Order)
                .where(Order.status == OrderStatus.pending, Order.created_at < cutoff)
                .with_for_update(skip_locked=True)
                .execution_options(populate_existing=True)
            )
        ).scalars()
        count = 0
        for order in orders:
            order.status = OrderStatus.expired
            count += 1
        await db.commit()
    logger.info("expired_pending_orders", count=count)
    return count


async def reconcile_pending_orders() -> int:
    """Query pending/expired orders without holding locks across network I/O.

    The legacy provider interface returns status only and orders do not record
    their provider. It still uses the configured provider; enabling real sales
    requires a separate provider/payment-receipt contract, not this refactor.
    """
    maker = get_async_session_maker()
    cutoff = datetime.now(UTC) - timedelta(minutes=30)
    provider = payment_provider.get_payment_provider()
    last_id = ""
    reconciled = checked = 0
    while True:
        async with maker() as db:
            candidates = (
                await db.execute(
                    select(Order.id, Order.order_number)
                    .where(Order.status.in_(PAYABLE_STATUSES), Order.created_at < cutoff, Order.id > last_id)
                    .order_by(Order.id)
                    .limit(RECONCILIATION_BATCH_SIZE)
                )
            ).all()
        if not candidates:
            break
        last_id = candidates[-1].id
        for order_id, order_number in candidates:
            checked += 1
            try:
                status = await provider.query_order(order_number)
                if status != OrderStatus.paid:
                    continue
                async with maker() as db:
                    applied = await settle_paid_order(db, order_id)
                    await db.commit()
                reconciled += int(applied)
            except Exception:
                # A failed order must not roll back or hide another committed
                # settlement. Its pending/expired row is retried on the next sweep.
                logger.warning("reconcile_order_failed", order_number=order_number, exc_info=True)
    logger.info("reconcile_pending_orders", reconciled=reconciled, checked=checked)
    return reconciled
