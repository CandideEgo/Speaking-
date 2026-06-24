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
        cutoff = datetime.now(UTC) - timedelta(minutes=30)
        async with async_session() as db:
            result = await db.execute(
                __import__("sqlalchemy")
                .select(Order)
                .where(
                    Order.status == OrderStatus.pending,
                    Order.created_at < cutoff,
                )
            )
            orders = result.scalars().all()
            count = 0
            for order in orders:
                order.status = OrderStatus.expired
                count += 1
            if count:
                await db.commit()
            logger.info("expired_pending_orders", count=count)
            return count

    return run_async(_process())
