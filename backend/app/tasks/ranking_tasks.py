"""Celery task for home rankings snapshots.

The ``snapshot_rankings`` beat job recomputes all three ranking scopes
(latest / weekly_views / weekly_favorites) from the database and overwrites
their Redis snapshots (``rankings:snapshot:{scope}``, TTL
``rankings_snapshot_ttl_seconds``). GET /videos/rankings reads through those
keys (fail-open), so one beat run refreshes every scope at once instead of
each request racing to repopulate a cold cache.

Runs on the cloud (default ``celery`` queue) alongside the scoring beat
tasks. Uses ``run_async`` so the body shares the worker's long-lived event
loop (Celery is sync; no ``asyncio.run`` per task).
"""

from app.core.cache import cache_set_json
from app.core.config import get_settings
from app.core.database import get_async_session_maker
from app.core.logging import get_logger
from app.services.ranking_service import RANKING_SCOPES, compute_rankings, rankings_cache_key
from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = get_logger(__name__)


@celery_app.task(name="app.tasks.ranking_tasks.snapshot_rankings")
def snapshot_rankings() -> None:
    """Recompute the three home-ranking scopes and overwrite their Redis snapshots."""

    async def _run() -> None:
        ttl = get_settings().rankings_snapshot_ttl_seconds
        async with get_async_session_maker()() as db:
            for scope in RANKING_SCOPES:
                items = await compute_rankings(db, scope)
                await cache_set_json(rankings_cache_key(scope), items, ttl=ttl)
        logger.info("snapshot_rankings: refreshed %d scopes", len(RANKING_SCOPES))

    run_async(_run())
