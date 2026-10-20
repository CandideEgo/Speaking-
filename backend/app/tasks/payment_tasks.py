"""Celery tasks for 金数据外部收款 → Pro 自动开通。

- ``sync_jinshuju_payments``: beat 定时同步（补漏，默认每 5 分钟），处理最近
  窗口内所有已付款的数据记录；
- ``process_jinshuju_entry``: 金数据数据推送 webhook 触发的单条处理 —— 先重新
  拉取该条记录做权威核对，再走与同步任务完全相同的幂等处理路径。

两个任务都把「读金数据 → 落库 → 延长 Pro」整体交给
``app.services.jinshuju_service``；任务本身只负责事件循环与异常隔离，任何
失败都只记日志，不会把 Celery worker 打挂。
"""

from typing import Any

import structlog

from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task
def process_jinshuju_entry(serial_number: int) -> None:
    """处理一条 webhook 推送（按数据序号重新拉取，避免信任推送内容）。"""
    from app.core.database import async_session
    from app.services import jinshuju_service

    async def _process() -> str:
        async with async_session() as db:
            entry = await jinshuju_service.fetch_entry(serial_number)
            return await jinshuju_service.process_entry(db, entry)

    try:
        outcome = run_async(_process())
        logger.info("jinshuju_webhook_processed", serial_number=serial_number, outcome=outcome)
    except Exception:
        logger.exception("jinshuju_webhook_process_failed", serial_number=serial_number)


@celery_app.task
def sync_jinshuju_payments() -> dict[str, Any]:
    """同步最近窗口内的金数据数据，补齐丢失的推送/停机期间的订单。"""
    from app.core.database import async_session
    from app.services import jinshuju_service

    async def _process() -> dict[str, Any]:
        async with async_session() as db:
            return await jinshuju_service.sync_recent_entries(db)

    try:
        return run_async(_process())
    except Exception:
        logger.exception("sync_jinshuju_payments_failed")
        return {"error": True}
