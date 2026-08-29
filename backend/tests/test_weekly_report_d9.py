"""Tests for D9 学习周报：聚合服务 + beat 任务 + /learning/weekly-reports 端点."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.models.learning import LearningRecord
from app.models.learning_plan import LearningEvent
from app.models.user import RoleType, User
from app.models.video import Video, VideoSource, VideoStatus
from app.models.weekly_report import WeeklyReport
from app.services.weekly_report_service import generate_report_for_week
from app.tasks.report_tasks import generate_weekly_reports

# 测试用周：2026-08-17（周一）— 2026-08-23（周日）
_WEEK_START = date(2026, 8, 17)


async def _make_user(db, phone: str) -> User:
    user = User(phone=phone, hashed_password="hashed", name="Weekly Test", role=RoleType.user)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _make_video(db, title: str) -> Video:
    video = Video(
        title=title,
        source_url=f"https://example.com/{title}.mp4",
        video_source=VideoSource.imported,
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


async def _add_record(db, user_id: str, video_id: str, seconds: int, at: datetime):
    db.add(LearningRecord(user_id=user_id, video_id=video_id, time_spent_seconds=seconds, last_accessed_at=at))
    await db.commit()


async def _add_event(db, user_id: str, event_type: str, value: int, on: date):
    db.add(LearningEvent(user_id=user_id, event_type=event_type, event_value=value, event_date=on))
    await db.commit()


# ── 聚合服务 ────────────────────────────────────────────────────────────


async def test_generate_report_aggregates_week_and_keeps_zeros():
    async with _session_maker()() as db:
        user = await _make_user(db, "13800200001")
        v1 = await _make_video(db, "wr-agg-1")
        v2 = await _make_video(db, "wr-agg-2")
        # 周一 30 分钟，周三 45 分钟
        await _add_record(db, user.id, v1.id, 1800, datetime(2026, 8, 17, 10, 0, tzinfo=UTC))
        await _add_record(db, user.id, v2.id, 2700, datetime(2026, 8, 19, 10, 0, tzinfo=UTC))
        # 事件：学词 5+3、复习 10、完成视频 2，分布在周一/二/三
        await _add_event(db, user.id, "learned_words", 5, date(2026, 8, 17))
        await _add_event(db, user.id, "reviewed_words", 10, date(2026, 8, 18))
        await _add_event(db, user.id, "learned_words", 3, date(2026, 8, 19))
        await _add_event(db, user.id, "completed_video", 2, date(2026, 8, 19))
        uid = user.id

        report = await generate_report_for_week(db, uid, _WEEK_START)
        await db.commit()

    assert report.total_minutes == 75
    assert report.new_words == 8
    assert report.reviewed_words == 10
    assert report.videos_completed == 2
    assert report.study_days == 3
    assert report.delta_minutes_pct is None  # 首周无环比
    assert report.highlight == "本周最长一次学习 45 分钟"
    daily = report.daily_minutes
    assert len(daily) == 7
    assert daily[0]["minutes"] == 30
    assert daily[1]["minutes"] == 0  # 0 值保留，不隐藏
    assert daily[2]["minutes"] == 45
    # 每日新词曲线：周一 5、周三 3，其余 0（含空日）
    words = report.daily_new_words
    assert len(words) == 7
    assert words[0]["words"] == 5
    assert words[1]["words"] == 0
    assert words[2]["words"] == 3


async def test_generate_report_computes_delta_when_prev_week_has_minutes():
    async with _session_maker()() as db:
        user = await _make_user(db, "13800200002")
        v1 = await _make_video(db, "wr-delta-1")
        v2 = await _make_video(db, "wr-delta-2")
        # 上周 50 分钟，本周 75 分钟 → +50%
        await _add_record(db, user.id, v1.id, 3000, datetime(2026, 8, 12, 10, 0, tzinfo=UTC))
        await _add_record(db, user.id, v2.id, 4500, datetime(2026, 8, 19, 10, 0, tzinfo=UTC))
        await _add_event(db, user.id, "learned_words", 1, date(2026, 8, 19))
        uid = user.id

        report = await generate_report_for_week(db, uid, _WEEK_START)
        await db.commit()

    assert report.delta_minutes_pct == 50.0


async def test_generate_report_idempotent_per_user_week():
    async with _session_maker()() as db:
        user = await _make_user(db, "13800200003")
        await _add_event(db, user.id, "learned_words", 2, date(2026, 8, 19))
        uid = user.id

        first = await generate_report_for_week(db, uid, _WEEK_START)
        second = await generate_report_for_week(db, uid, _WEEK_START)
        await db.commit()

    assert first.id == second.id
    async with _session_maker()() as db:
        rows = (await db.execute(select(WeeklyReport).where(WeeklyReport.user_id == uid))).scalars().all()
        assert len(rows) == 1


# ── beat 任务 ───────────────────────────────────────────────────────────


async def test_generate_weekly_reports_task_only_for_active_users():
    async with _session_maker()() as db:
        active = await _make_user(db, "13800200004")
        idle = await _make_user(db, "13800200005")
        await _add_event(db, active.id, "learned_words", 4, date(2026, 8, 20))
        # idle 用户只在本周之外有事件
        await _add_event(db, idle.id, "learned_words", 1, date(2026, 9, 1))
        active_id, idle_id = active.id, idle.id

    # 周一 00:00 UTC 触发 → 生成上一周（08-17 周）
    count = generate_weekly_reports(now=datetime(2026, 8, 24, 0, 0, tzinfo=UTC))
    assert count == 1

    async with _session_maker()() as db:
        active_rows = (await db.execute(select(WeeklyReport).where(WeeklyReport.user_id == active_id))).scalars().all()
        idle_rows = (await db.execute(select(WeeklyReport).where(WeeklyReport.user_id == idle_id))).scalars().all()
        assert len(active_rows) == 1
        assert active_rows[0].week_start == _WEEK_START
        assert idle_rows == []

    # 幂等重跑：不产生重复行
    generate_weekly_reports(now=datetime(2026, 8, 24, 5, 0, tzinfo=UTC))
    async with _session_maker()() as db:
        rows = (await db.execute(select(WeeklyReport).where(WeeklyReport.user_id == active_id))).scalars().all()
        assert len(rows) == 1


# ── 端点 ────────────────────────────────────────────────────────────────


async def test_weekly_report_endpoints_404_then_200(client, db_session, auth_headers):
    # 默认用户尚无周报
    resp = await client.get("/api/v1/learning/weekly-reports/latest", headers=auth_headers)
    assert resp.status_code == 404

    me = await client.get("/api/v1/users/me", headers=auth_headers)
    user_id = me.json()["id"]
    db_session.add(
        WeeklyReport(
            user_id=user_id,
            week_start=_WEEK_START,
            study_days=3,
            total_minutes=75,
            new_words=8,
            reviewed_words=10,
            videos_completed=2,
            streak_at_week_end=5,
            delta_minutes_pct=None,
            daily_minutes=[{"date": (_WEEK_START + timedelta(days=i)).isoformat(), "minutes": 0} for i in range(7)],
            highlight="本周最长一次学习 45 分钟",
        )
    )
    await db_session.commit()

    latest = await client.get("/api/v1/learning/weekly-reports/latest", headers=auth_headers)
    assert latest.status_code == 200
    body = latest.json()
    assert body["week_start"] == _WEEK_START.isoformat()
    assert body["total_minutes"] == 75
    assert body["delta_minutes_pct"] is None

    listing = await client.get("/api/v1/learning/weekly-reports", headers=auth_headers)
    assert listing.status_code == 200
    data = listing.json()
    assert data["total"] == 1
    assert data["items"][0]["week_start"] == _WEEK_START.isoformat()


def _session_maker():
    from app.core.database import get_async_session_maker

    return get_async_session_maker()
