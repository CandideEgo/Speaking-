"""A02：有效学习时长的事实链。

三条不变量，对应审计关闭条件里的三句：
- 同一事件不重复累计（event_id 去重）
- 单事件有上限（拖动/异常间隔不会一次记进一小时）
- 个人页与周统计同口径（同一个聚合函数、同一种取整）
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.models.learning import LearningRecord
from app.models.learning_plan import LearningEvent
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _me_id(client: AsyncClient, auth_headers: dict) -> str:
    return (await client.get("/api/v1/users/me", headers=auth_headers)).json()["id"]


async def _video_with_record(client: AsyncClient, auth_headers: dict) -> tuple[str, str]:
    """Return (user_id, video_id) with a zeroed LearningRecord."""
    user_id = await _me_id(client, auth_headers)
    async with TestSessionLocal() as db:
        video = Video(
            title=f"study-time-{datetime.now(UTC).timestamp()}",
            source_url="https://example.com/study.mp4",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            duration=600.0,
        )
        db.add(video)
        await db.flush()
        db.add(
            LearningRecord(
                user_id=user_id,
                video_id=video.id,
                time_spent_seconds=0,
                progress_percentage=0.0,
            )
        )
        await db.commit()
        return user_id, video.id


async def _time_spent(user_id: str, video_id: str) -> int:
    async with TestSessionLocal() as db:
        record = (
            await db.execute(
                LearningRecord.__table__.select().where(
                    LearningRecord.user_id == user_id,
                    LearningRecord.video_id == video_id,
                )
            )
        ).first()
        return int(record.time_spent_seconds or 0) if record else 0


def _watch_event(video_id: str, delta: float, event_id: str) -> dict:
    return {
        "video_id": video_id,
        "event_type": "watch_time",
        "event_payload": {"delta_s": delta, "v": 2},
        "event_id": event_id,
        "session_id": "sess-1",
        "client_ts": int(datetime.now(UTC).timestamp() * 1000),
    }


class TestWatchTimeIngest:
    async def test_duplicate_event_id_is_counted_once(self, client: AsyncClient, auth_headers: dict):
        user_id, video_id = await _video_with_record(client, auth_headers)
        event = _watch_event(video_id, 10, "evt-dup-1")

        for _ in range(2):
            resp = await client.post("/api/v1/behavior/events", json=event, headers=auth_headers)
            assert resp.status_code == 200, resp.text

        assert await _time_spent(user_id, video_id) == 10

    async def test_distinct_events_accumulate(self, client: AsyncClient, auth_headers: dict):
        user_id, video_id = await _video_with_record(client, auth_headers)
        for index in range(3):
            resp = await client.post(
                "/api/v1/behavior/events",
                json=_watch_event(video_id, 10, f"evt-{index}"),
                headers=auth_headers,
            )
            assert resp.status_code == 200

        assert await _time_spent(user_id, video_id) == 30

    async def test_oversized_delta_is_dropped(self, client: AsyncClient, auth_headers: dict):
        """一个 20 分钟的事件不能被当成学习时间（v1 拖动一次记 60 秒的同族问题）。"""
        user_id, video_id = await _video_with_record(client, auth_headers)
        resp = await client.post(
            "/api/v1/behavior/events",
            json=_watch_event(video_id, 1200, "evt-big"),
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert await _time_spent(user_id, video_id) == 0

    async def test_sub_second_tail_is_not_dropped(self, client: AsyncClient, auth_headers: dict):
        """0.6 秒的尾段要进账 1 秒，而不是被 int() 截成 0。"""
        user_id, video_id = await _video_with_record(client, auth_headers)
        resp = await client.post(
            "/api/v1/behavior/events",
            json=_watch_event(video_id, 0.6, "evt-tail"),
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert await _time_spent(user_id, video_id) == 1

    async def test_first_watch_of_the_day_writes_one_learning_event(self, client: AsyncClient, auth_headers: dict):
        """只看视频的用户也要出现在学习日历上，但一天只记一条。"""
        user_id, video_id = await _video_with_record(client, auth_headers)
        for index in range(3):
            await client.post(
                "/api/v1/behavior/events",
                json=_watch_event(video_id, 10, f"evt-day-{index}"),
                headers=auth_headers,
            )

        async with TestSessionLocal() as db:
            rows = (
                await db.execute(
                    LearningEvent.__table__.select().where(
                        LearningEvent.user_id == user_id,
                        LearningEvent.event_type == "watched_video",
                    )
                )
            ).all()

        assert len(rows) == 1
        # 不计入每日计数器：它的作用只是标出「这天学过」。
        assert rows[0].event_value == 1


class TestAggregationAgreement:
    async def test_overview_and_weekly_report_the_same_minutes(self, client: AsyncClient, auth_headers: dict):
        """两个页面给用户的「本周学了多久」必须是同一个数。"""
        from app.models.behavior import BehaviorEvent

        user_id, _ = await _video_with_record(client, auth_headers)
        now = datetime.now(UTC)
        async with TestSessionLocal() as db:
            db.add_all(
                [
                    BehaviorEvent(
                        user_id=user_id,
                        event_type="watch_time",
                        event_payload={"delta_s": 300, "v": 2},
                        server_ts=now - timedelta(minutes=5),
                    ),
                    BehaviorEvent(
                        user_id=user_id,
                        event_type="watch_time",
                        event_payload={"delta_s": 120, "v": 2},
                        server_ts=now - timedelta(minutes=2),
                    ),
                ]
            )
            await db.commit()

        weekly = (await client.get("/api/v1/learning/stats/weekly", headers=auth_headers)).json()
        overview = (await client.get("/api/v1/users/me/overview", headers=auth_headers)).json()

        # 同一天的 420 秒 → 逐日取整后 7 分钟
        assert weekly["this_week_minutes"] == 7
        assert overview["this_week"]["minutes"] == 7
        assert weekly["daily_minutes"] == [
            {"date": row["date"], "minutes": row["minutes"]} for row in overview["this_week"]["daily"]
        ]
