"""Retired reports stay in storage; neither queued jobs nor APIs generate more."""

from datetime import date

import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models.weekly_report import WeeklyReport
from app.services.weekly_report_service import generate_report_for_week
from app.tasks.report_tasks import generate_weekly_reports
from tests.conftest import TestSessionLocal


async def test_retired_reports_preserve_history(client, auth_headers):
    uid = (await client.get("/api/v1/users/me", headers=auth_headers)).json()["id"]
    async with TestSessionLocal() as db:
        report = WeeklyReport(
            user_id=uid,
            week_start=date(2026, 10, 12),
            study_days=2,
            total_minutes=5,
            new_words=2,
            reviewed_words=0,
            videos_completed=0,
            streak_at_week_end=0,
            daily_minutes=[],
            highlight="Historical report",
        )
        db.add(report)
        await db.commit()
        report_id = report.id
        with pytest.raises(AppError):
            await generate_report_for_week(db, uid, date(2026, 10, 19))
    assert generate_weekly_reports() == 0
    assert (await client.get("/api/v1/learning/weekly-reports", headers=auth_headers)).status_code == 410
    async with TestSessionLocal() as db:
        reports = (await db.execute(select(WeeklyReport))).scalars().all()
        assert len(reports) == 1
        assert reports[0].id == report_id
        assert reports[0].highlight == "Historical report"
