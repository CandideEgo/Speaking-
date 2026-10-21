"""Retired weekly-report task name retained for messages already in the queue."""

from datetime import datetime

from app.tasks.celery_app import celery_app


@celery_app.task
def generate_weekly_reports(now: datetime | None = None):
    """Queued compatibility task: never generate retired reports."""
    return 0
