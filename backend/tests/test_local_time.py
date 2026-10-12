"""Unit tests for the single user-local-day authority (BUG-16 / DEC-079).

Pure functions only — no DB. The DB-reading form (`get_user_local_date`) is
exercised through the study-session and reminder suites.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.services.local_time import (
    DEFAULT_USER_TIMEZONE,
    resolve_user_timezone,
    user_local_date,
    user_local_now,
)
from app.tasks.reminder_tasks import _to_local


def test_resolve_falls_back_to_east_eight():
    """No preference — and a garbage preference — both land on Asia/Shanghai."""
    assert resolve_user_timezone(None) == ZoneInfo("Asia/Shanghai")
    assert resolve_user_timezone("") == ZoneInfo(DEFAULT_USER_TIMEZONE)
    assert resolve_user_timezone("Not/AZone") == ZoneInfo(DEFAULT_USER_TIMEZONE)


def test_resolve_honours_explicit_timezone():
    assert resolve_user_timezone("UTC") == ZoneInfo("UTC")
    assert resolve_user_timezone("America/New_York") == ZoneInfo("America/New_York")


def test_local_date_is_the_users_calendar_day_not_utc():
    """The whole point of DEC-079: 20:00 UTC is already *tomorrow* in东八."""
    instant = datetime(2026, 1, 1, 20, 0, tzinfo=UTC)
    assert instant.date().isoformat() == "2026-01-01"  # what the old UTC fallback used
    assert user_local_date(None, now=instant).isoformat() == "2026-01-02"


def test_local_now_respects_an_explicit_preference():
    instant = datetime(2026, 1, 1, 20, 0, tzinfo=UTC)
    assert user_local_now("UTC", now=instant).hour == 20
    assert user_local_now(None, now=instant).hour == 4


def test_reminders_and_counters_share_one_basis():
    """Regression guard for the drift: the reminder sweep and the daily
    counters must resolve the same wall clock for the same instant."""
    instant = datetime(2026, 1, 1, 20, 0, tzinfo=UTC)
    assert _to_local(instant, None) == user_local_now(None, now=instant)
    assert _to_local(instant, "UTC") == user_local_now("UTC", now=instant)
