"""Weekly watch-time and atomic daily counters (BE-08).

Two regressions this file pins:

1. ``GET /learning/stats/weekly`` used to sum ``LearningRecord
   .time_spent_seconds`` filtered by ``last_accessed_at``. That column is a
   cumulative per-record counter, so all history landed on the last visit day.
   The source of truth is now the per-flush ``behavior_events.watch_time``
   rows, bucketed by ``server_ts``.
2. Daily counters and streak were read-modify-write in Python. They are now
   conditional atomics; this file checks the observable invariants (two events
   on the same day extend the streak once, the goal meta-event is emitted
   once).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.models.behavior import BehaviorEvent
from app.models.learning import LearningRecord
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.preferences import UserPreferences
from app.models.video import Video, VideoStatus
from app.services.learning_event_service import (
    EVENT_LEARNED_WORDS,
    EVENT_MET_DAILY_GOAL,
    emit_event,
    get_today_progress,
)
from app.services.local_time import get_user_local_date
from tests.conftest import TestSessionLocal

if TYPE_CHECKING:
    from httpx import AsyncClient


async def _user_id(client: AsyncClient, auth_headers: dict) -> str:
    return (await client.get("/api/v1/users/me", headers=auth_headers)).json()["id"]


def _this_monday(now: datetime) -> datetime:
    midnight = datetime(now.year, now.month, now.day, tzinfo=UTC)
    return midnight - timedelta(days=midnight.weekday())


class TestWeeklyMinutes:
    async def test_weekly_minutes_come_from_watch_events_not_cumulative_record(
        self, client: AsyncClient, auth_headers: dict
    ):
        user_id = await _user_id(client, auth_headers)
        now = datetime.now(UTC)
        this_monday = _this_monday(now)
        last_monday = this_monday - timedelta(days=7)
        video_id = str(uuid.uuid4())

        async with TestSessionLocal() as db:
            db.add(
                Video(
                    id=video_id,
                    title="Weekly stats fixture",
                    source_url=f"https://example.com/{video_id}.mp4",
                    status=VideoStatus.ready,
                    is_official=True,
                    is_published=True,
                    review_status="published",
                )
            )
            # Legacy cumulative row: 99999 s on one record. It must not leak
            # into this week's minutes just because last_accessed_at is now.
            db.add(
                LearningRecord(
                    user_id=user_id,
                    video_id=video_id,
                    time_spent_seconds=99999,
                    last_accessed_at=now,
                )
            )
            db.add_all(
                [
                    BehaviorEvent(
                        user_id=user_id,
                        event_type="watch_time",
                        event_payload={"delta_s": 120},
                        server_ts=now - timedelta(minutes=5),
                    ),
                    BehaviorEvent(
                        user_id=user_id,
                        event_type="watch_time",
                        event_payload={"delta_s": 180},
                        server_ts=now - timedelta(minutes=2),
                    ),
                    BehaviorEvent(
                        user_id=user_id,
                        event_type="watch_time",
                        event_payload={"delta_s": 300},
                        server_ts=last_monday + timedelta(hours=2),
                    ),
                    # Non-watch events must not be counted as minutes.
                    BehaviorEvent(
                        user_id=user_id,
                        event_type="complete",
                        event_payload={"delta_s": 999},
                        server_ts=now - timedelta(minutes=1),
                    ),
                ]
            )
            await db.commit()

        resp = await client.get("/api/v1/learning/stats/weekly", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["this_week_minutes"] == 5
        assert data["last_week_minutes"] == 5
        assert data["week_delta_pct"] == 0.0
        today = now.date().isoformat()
        today_row = next(row for row in data["daily_minutes"] if row["date"] == today)
        assert today_row["minutes"] == 5


class TestAtomicDailyCounters:
    async def test_counter_addition_and_streak_are_idempotent_per_day(
        self, client: AsyncClient, auth_headers: dict, db_session
    ):
        user_id = await _user_id(client, auth_headers)
        async with TestSessionLocal() as db:
            db.add(UserPreferences(user_id=user_id, daily_goal_type="words", daily_goal_value=999))
            await db.commit()

        async with TestSessionLocal() as db:
            today = await get_user_local_date(db, user_id)
            await emit_event(db, user_id, EVENT_LEARNED_WORDS, event_value=1)
            await emit_event(db, user_id, EVENT_LEARNED_WORDS, event_value=2)
            await db.commit()

        async with TestSessionLocal() as db:
            profile = (
                await db.execute(select(UserLearningProfile).where(UserLearningProfile.user_id == user_id))
            ).scalar_one()
            assert profile.today_words_learned == 3
            assert profile.today_date == today
            # Two events on the same day count as one active day.
            assert profile.current_streak == 1
            assert profile.last_active_date == today

    async def test_goal_meta_event_is_emitted_once(self, client: AsyncClient, auth_headers: dict, db_session):
        user_id = await _user_id(client, auth_headers)
        async with TestSessionLocal() as db:
            db.add(UserPreferences(user_id=user_id, daily_goal_type="words", daily_goal_value=2))
            await db.commit()

        async with TestSessionLocal() as db:
            await emit_event(db, user_id, EVENT_LEARNED_WORDS, event_value=1)
            await emit_event(db, user_id, EVENT_LEARNED_WORDS, event_value=1)
            # Already met: a later event must not emit a second meta-event.
            await emit_event(db, user_id, EVENT_LEARNED_WORDS, event_value=1)
            await db.commit()

        async with TestSessionLocal() as db:
            meta_count = await db.scalar(
                select(func.count())
                .select_from(LearningEvent)
                .where(
                    LearningEvent.user_id == user_id,
                    LearningEvent.event_type == EVENT_MET_DAILY_GOAL,
                )
            )
            assert meta_count == 1
            progress = await get_today_progress(db, user_id)
            assert progress["today_words_learned"] == 3
            assert progress["goal_met"] is True
