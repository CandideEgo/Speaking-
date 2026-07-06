"""Celery tasks for video scoring (P1, ADR-0011).

- ``compute_video_score_task``: single-video scoring. Called from
  ``finalize_video`` (new videos scored immediately) and by the beat jobs.
- ``compute_top_scores``: re-score the Top 200 by view_count hourly — keeps hot
  videos fresh as behavior accrues.
- ``compute_all_scores``: re-score every ready video daily — picks up cold/
  long-tail videos the hourly job skips.

Runs on the cloud (default ``celery`` queue). Uses ``run_async`` so all three
share the worker's long-lived event loop (Celery is sync; no ``asyncio.run``
per task).
"""

from sqlalchemy import select

from app.core.database import async_session
from app.core.logging import get_logger
from app.models.video import Video, VideoStatus
from app.services.scoring_service import compute_video_score
from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = get_logger(__name__)

_READY_STATES = [VideoStatus.ready, VideoStatus.ready_subtitles]


@celery_app.task(name="app.tasks.scoring_tasks.compute_video_score_task")
def compute_video_score_task(video_id: str):
    """Compute + persist the learning_score for one video."""

    async def _run():
        async with async_session() as db:
            await compute_video_score(db, video_id)

    run_async(_run())


@celery_app.task(name="app.tasks.scoring_tasks.compute_top_scores")
def compute_top_scores(limit: int = 200):
    """Re-score the Top ``limit`` videos by view_count (hourly hot refresh)."""

    async def _run():
        async with async_session() as db:
            ids = (
                (
                    await db.execute(
                        select(Video.id)
                        .where(Video.status.in_(_READY_STATES))
                        .order_by(Video.view_count.desc())
                        .limit(limit)
                    )
                )
                .scalars()
                .all()
            )
            for vid in ids:
                await compute_video_score(db, vid)
            logger.info("compute_top_scores: scored %d videos", len(ids))

    run_async(_run())


@celery_app.task(name="app.tasks.scoring_tasks.compute_all_scores")
def compute_all_scores():
    """Re-score every ready video (daily full refresh)."""

    async def _run():
        async with async_session() as db:
            ids = (await db.execute(select(Video.id).where(Video.status.in_(_READY_STATES)))).scalars().all()
            for vid in ids:
                await compute_video_score(db, vid)
            logger.info("compute_all_scores: scored %d videos", len(ids))

    run_async(_run())
