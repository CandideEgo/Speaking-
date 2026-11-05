"""Stable Celery entry points; order transactions live in the application service."""

import structlog

from app.services import order_service
from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task
def expire_pending_orders():
    try:
        return run_async(order_service.expire_pending_orders())
    except Exception:
        logger.exception("expire_pending_orders failed")
        return 0


@celery_app.task
def reconcile_pending_orders():
    try:
        return run_async(order_service.reconcile_pending_orders())
    except Exception:
        logger.exception("reconcile_pending_orders failed")
        return 0
