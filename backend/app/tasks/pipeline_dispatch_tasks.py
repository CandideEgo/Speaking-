"""Beat: re-send pipeline intents that never reached the broker (A05/BE-01).

Every pending row in ``pipeline_dispatches`` is one cross-process hand-off
(GPU transcription or the pipeline tail) whose DB state was committed but whose
Celery message may never have gone out — broker down, worker killed in the gap.
The scan sends whatever is due, prunes settled rows, and raises an alert when
the backlog stops draining.

The alert is throttled through Redis (``SET NX`` with a TTL) so a persistent
broker outage produces one alarm per window instead of one per minute; if Redis
itself is down the alert still goes out, because a Redis outage is exactly when
the backlog matters.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.config import get_settings
from app.core.logging import get_logger
from app.tasks.celery_app import celery_app
from app.tasks.pipeline_helpers import get_pipeline_redis, run_pipeline_task

if TYPE_CHECKING:
    from app.services.pipeline_dispatch import DispatchSweep

logger = get_logger(__name__)

_ALERT_THROTTLE_KEY = "pipeline:dispatch:alert"
_ALERT_THROTTLE_SECONDS = 30 * 60


def _alert_allowed() -> bool:
    try:
        r = get_pipeline_redis()
        return bool(r.set(_ALERT_THROTTLE_KEY, "1", nx=True, ex=_ALERT_THROTTLE_SECONDS))
    except Exception:
        # Redis unreachable: do not swallow the alert — a broker/Redis outage is
        # the most likely reason a backlog exists at all.
        logger.warning("pipeline dispatch alert throttle unavailable", exc_info=True)
        return True


async def _run_dispatch_pipeline() -> DispatchSweep:
    """Module-level so it can be unit-tested with a patched ``async_session``."""
    # Imported here, not at module scope: ``app.services.pipeline_dispatch``
    # imports this app's celery instance, so a top-level import would close the
    # cycle celery_app → this module → services.pipeline_dispatch → celery_app
    # for any entry point that imports the service first.
    from app.core.database import async_session
    from app.services.pipeline_dispatch import backlog, dispatch_pending, prune_settled

    settings = get_settings()
    async with async_session() as db:
        sweep = await dispatch_pending(db)
        sweep.pruned = await prune_settled(db, retention_hours=settings.pipeline_dispatch_retention_hours)
        state = await backlog(db)

    if sweep.scanned:
        logger.info(
            "pipeline_dispatch_sweep",
            scanned=sweep.scanned,
            sent=sweep.sent,
            failed=sweep.failed,
            abandoned=sweep.abandoned,
            pruned=sweep.pruned,
            still_pending=state.pending,
        )

    over_count = state.pending > settings.pipeline_dispatch_backlog_alert_threshold
    over_age = (
        state.oldest_age_seconds is not None
        and state.oldest_age_seconds > settings.pipeline_dispatch_backlog_alert_age_seconds
    )
    if (over_count or over_age) and _alert_allowed():
        from app.services.alert_service import send_alert

        detail = f"pending={state.pending} oldest_age_s={state.oldest_age_seconds}"
        if sweep.failed or sweep.abandoned:
            detail += f" failed_now={sweep.failed} abandoned_now={sweep.abandoned}"
        try:
            await send_alert("管线任务派发积压", detail, severity="critical")
        except Exception:
            logger.warning("pipeline dispatch backlog alert delivery failed", exc_info=True)

    return sweep


@celery_app.task(name="app.tasks.pipeline_dispatch_tasks.dispatch_pipeline_tasks")
def dispatch_pipeline_tasks():
    """Celery wrapper for ``_run_dispatch_pipeline`` (beat-scheduled every 60s)."""
    run_pipeline_task(_run_dispatch_pipeline())
