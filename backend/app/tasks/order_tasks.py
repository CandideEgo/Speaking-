"""Celery tasks for order lifecycle management."""

from datetime import UTC, datetime, timedelta

import structlog

from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task
def expire_pending_orders():
    """Mark pending orders as expired if created more than 30 minutes ago.

    Runs on a Celery beat schedule (every 5 minutes).
    """
    from app.core.database import async_session
    from app.models.order import Order, OrderStatus

    async def _process():
        from sqlalchemy import select

        cutoff = datetime.now(UTC) - timedelta(minutes=30)
        async with async_session() as db:
            result = await db.execute(
                select(Order)
                .where(
                    Order.status == OrderStatus.pending,
                    Order.created_at < cutoff,
                )
                .with_for_update(skip_locked=True)
            )
            orders = result.scalars().all()
            count = 0
            for order in orders:
                # Re-check status — a concurrent payment callback may have
                # changed it to paid while we waited for the row lock.
                if order.status != OrderStatus.pending:
                    continue
                order.status = OrderStatus.expired
                count += 1
            if count:
                await db.commit()
            logger.info("expired_pending_orders", count=count)
            return count

    try:
        return run_async(_process())
    except Exception:
        logger.exception("expire_pending_orders failed")
        return 0


@celery_app.task
def reconcile_pending_orders():
    """Reconcile pending orders whose callback may have been lost.

    For each order pending >30 minutes, query the payment provider
    (``provider.query_order``) for the authoritative status.  If the
    platform reports the order paid, upgrade the user to Pro via the
    shared payment-processing helper — exactly as a callback would.

    This closes the gap where a callback is lost (network, 5xx exhaustion,
    provider outage) and the user paid but never received Pro.  Runs on a
    Celery beat schedule (every 15 minutes).
    """
    from app.core.database import async_session
    from app.models.order import Order, OrderStatus
    from app.services.payment_provider import get_payment_provider

    async def _process():
        from sqlalchemy import select

        cutoff = datetime.now(UTC) - timedelta(minutes=30)
        async with async_session() as db:
            result = await db.execute(
                select(Order)
                .where(
                    Order.status == OrderStatus.pending,
                    Order.created_at < cutoff,
                )
                .with_for_update(skip_locked=True)
            )
            orders = result.scalars().all()
            reconciled = 0
            for order in orders:
                if order.status != OrderStatus.pending:
                    continue
                # The Order model doesn't store which provider created it,
                # so reconciliation uses the configured default provider.
                provider = get_payment_provider()
                try:
                    status = await provider.query_order(order.order_number)
                except Exception:
                    logger.warning(
                        "reconcile_query_failed",
                        order_number=order.order_number,
                        exc_info=True,
                    )
                    continue
                if status == OrderStatus.paid:
                    # Delegate to the shared success handler — same code
                    # path as the callback endpoints.  Imported lazily to
                    # avoid a task-time circular import.
                    from app.api.v1.payments import _process_successful_payment

                    await _process_successful_payment(db, order)
                    reconciled += 1
                    logger.info(
                        "reconciled_order",
                        order_number=order.order_number,
                        user_id=order.user_id,
                    )
            logger.info("reconcile_pending_orders", reconciled=reconciled, checked=len(orders))
            return reconciled

    try:
        return run_async(_process())
    except Exception:
        logger.exception("reconcile_pending_orders failed")
        return 0
