"""Retired report generation; the historical model is retained for export."""

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.weekly_report import WeeklyReport
from app.services.retired_features import feature_gone


async def generate_report_for_week(db: AsyncSession, user_id: str, week_start: date) -> WeeklyReport:
    feature_gone()
