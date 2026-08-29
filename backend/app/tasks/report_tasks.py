"""Celery beat task for D9 weekly report generation.

Runs Monday 00:00 UTC (= 08:00 Beijing): aggregates the just-finished
Mon–Sun week into ``weekly_reports`` for every user with at least one
LearningEvent in that window. Idempotent — existing (user, week) rows are
skipped by ``generate_report_for_week``.
"""

from datetime import UTC, datetime, timedelta

import structlog

from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task
def generate_weekly_reports(now: datetime | None = None):
    """Generate last week's reports for all active learners."""
    from app.core.database import async_session

    async def _process():
        from sqlalchemy import select

        from app.models.learning_plan import LearningEvent
        from app.models.user import User
        from app.services.weekly_report_service import generate_report_for_week

        now_utc = now or datetime.now(UTC)
        # Monday of the current week → last week's window
        start_of_today = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=UTC)
        this_monday = start_of_today - timedelta(days=start_of_today.weekday())
        week_start = (this_monday - timedelta(days=7)).date()
        week_end = this_monday.date()

        count = 0
        async with async_session() as db:
            # Users with any LearningEvent in the target week
            user_ids = (
                (
                    await db.execute(
                        select(LearningEvent.user_id)
                        .where(
                            LearningEvent.event_date >= week_start,
                            LearningEvent.event_date < week_end,
                        )
                        .distinct()
                    )
                )
                .scalars()
                .all()
            )

            for user_id in user_ids:
                # Skip deleted users defensively
                user = await db.get(User, user_id)
                if user is None:
                    continue
                await generate_report_for_week(db, user_id, week_start)
                count += 1
            if count:
                await db.commit()
            logger.info("weekly_reports_generated", count=count, week_start=week_start.isoformat())
            return count

    try:
        return run_async(_process())
    except Exception:
        logger.exception("generate_weekly_reports failed")
        return 0
