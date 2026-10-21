"""Celery tasks for 金数据外部收款 → Pro 自动开通。

- ``sync_jinshuju_payments``: beat 定时同步（补漏，默认每 5 分钟），处理最近
  窗口内所有已付款的数据记录；
- ``process_jinshuju_entry``: 金数据数据推送 webhook 触发的单条处理 —— 先重新
  拉取该条记录做权威核对，再走与同步任务完全相同的幂等处理路径。

两个任务都把「读金数据 → 落库 → 延长 Pro」整体交给
``app.services.jinshuju_service``；任务本身只负责事件循环与异常隔离。

**失败必须冒泡给 Celery**：用户已经付款，任务静默失败 = 这笔钱永远不开通。
两个任务都挂了 ``autoretry_for``（指数退避 + 抖动，最多 3 次）；耗尽重试后
Celery 把任务记成 FAILED（可观测、可人工介入），而不是「记条日志就当没事发生」。
处理路径本身是幂等的（``entry_token`` 唯一索引 + 行锁），所以重试安全。
"""

from typing import Any

import structlog

from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()

# 瞬时故障（金数据接口抖动 / DB 断连 / 锁等待超时）都值得重试；
# 重试耗尽后由 beat 的定时同步兜底（回看窗口 jinshuju_sync_lookback_hours）。
_RETRY = {
    "autoretry_for": (Exception,),
    "retry_backoff": True,
    "retry_backoff_max": 120,
    "retry_jitter": True,
    "max_retries": 3,
}


@celery_app.task(**_RETRY)
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
        # 冒泡 → Celery 按 _RETRY 重试。已付款订单不能因为一次瞬时故障被丢掉。
        raise


@celery_app.task(**_RETRY)
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
        # 冒泡 → Celery 重试并最终记成 FAILED（可观测）。
        # 下一轮 beat（每 5 分钟）仍会兜底。
        raise
