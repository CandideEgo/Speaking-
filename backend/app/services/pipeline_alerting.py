"""Pipeline failure recording for the health monitor (A09/OPS-05).

Why a Redis list instead of a DB query: ``videos`` has no "failed at" column
(only ``download_failed_at``, which is download-specific), so a time-windowed
failure rate cannot be read from the table. The alternative — a migration plus
a stamp at every one of the seven places that set ``status=error`` — buys the
same signal for more coupling. A capped, TTL'd Redis list is written at the
same points, keeps the ids for the alert, and cannot fail the pipeline (every
write is best-effort and swallows errors).

Known trade-off: the list dies with Redis. A Redis outage is covered by its own
health checks, and the count is a rate signal, not an audit trail.
"""

from __future__ import annotations

import json
import time
from collections.abc import Awaitable
from typing import Any, cast

from app.core.logging import get_logger

logger = get_logger(__name__)

FAILURE_LIST_KEY = "pipeline:failures:recent"
FAILURE_LIST_LIMIT = 199  # LRANGE 0..199 = 200 entries
FAILURE_LIST_TTL_SECONDS = 3 * 3600


async def record_pipeline_failure(video_id: str, *, step: str | None = None, reason: str | None = None) -> None:
    """Remember that ``video_id`` entered ``error``. Never raises."""
    try:
        from app.core.redis import get_redis

        entry = json.dumps(
            {
                "ts": time.time(),
                "video_id": video_id,
                "step": step,
                "reason": (reason or "")[:200],
            },
            ensure_ascii=False,
        )
        redis = get_redis()
        # redis-py's async client is typed as returning `Awaitable[x] | x`
        # (it doubles as the sync client); awaiting it here is the async path.
        await cast("Awaitable[int]", redis.lpush(FAILURE_LIST_KEY, entry))
        await cast("Awaitable[str]", redis.ltrim(FAILURE_LIST_KEY, 0, FAILURE_LIST_LIMIT))
        await cast("Awaitable[Any]", redis.expire(FAILURE_LIST_KEY, FAILURE_LIST_TTL_SECONDS))
    except Exception:
        logger.warning("pipeline failure record failed", video_id=video_id, exc_info=True)


async def read_pipeline_failures(window_minutes: int, *, redis=None) -> list[dict]:
    """Failures recorded inside the window, newest first. Raises on Redis errors
    (the caller turns that into its own health problem)."""
    if redis is None:
        from app.core.redis import get_redis

        redis = get_redis()
    raw = await redis.lrange(FAILURE_LIST_KEY, 0, FAILURE_LIST_LIMIT)
    cutoff = time.time() - window_minutes * 60
    entries: list[dict] = []
    for item in raw or []:
        try:
            entry = json.loads(item)
        except (TypeError, ValueError):
            continue
        if float(entry.get("ts", 0)) >= cutoff:
            entries.append(entry)
    return entries
