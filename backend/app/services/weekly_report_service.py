"""Weekly report aggregation (D9 学习周报，产品设计规划-2026-08 §4).

Generates one ``WeeklyReport`` per user per ISO week from the same sources
as ``GET /learning/stats/weekly``: LearningRecord (minutes) + LearningEvent
(words/videos/streak days). Idempotent: an existing (user, week_start) row
is returned unchanged.
"""

from datetime import UTC, date, datetime, timedelta

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning import LearningRecord
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.weekly_report import WeeklyReport

logger = structlog.get_logger(__name__)

_HIGHLIGHT_FALLBACK = "坚持就是胜利"


async def generate_report_for_week(db: AsyncSession, user_id: str, week_start: date) -> WeeklyReport:
    """Aggregate [week_start, week_start+7d) into a WeeklyReport.

    Idempotent: returns the existing row if the week was already generated.
    Caller commits.
    """
    existing = await db.scalar(
        select(WeeklyReport).where(WeeklyReport.user_id == user_id, WeeklyReport.week_start == week_start)
    )
    if existing is not None:
        return existing

    # 查询窗口用 aware UTC datetime（与 stats_weekly 一致，避免 date/timestamp 隐式比较差异）
    start_dt = datetime(week_start.year, week_start.month, week_start.day, tzinfo=UTC)
    end_dt = start_dt + timedelta(days=7)
    week_end_date = week_start + timedelta(days=7)  # LearningEvent.event_date 是 Date 列

    # ── 时长：LearningRecord.time_spent_seconds within the window ──
    total_seconds = (
        (
            await db.execute(
                select(func.coalesce(func.sum(LearningRecord.time_spent_seconds), 0)).where(
                    LearningRecord.user_id == user_id,
                    LearningRecord.last_accessed_at >= start_dt,
                    LearningRecord.last_accessed_at < end_dt,
                )
            )
        )
        .scalars()
        .one()
    )
    total_minutes = int(total_seconds) // 60

    rows = (
        await db.execute(
            select(
                func.date(LearningRecord.last_accessed_at).label("d"),
                func.coalesce(func.sum(LearningRecord.time_spent_seconds), 0).label("s"),
            )
            .where(
                LearningRecord.user_id == user_id,
                LearningRecord.last_accessed_at >= start_dt,
                LearningRecord.last_accessed_at < end_dt,
            )
            .group_by(func.date(LearningRecord.last_accessed_at))
        )
    ).all()
    by_day = {str(r.d): int(r.s) for r in rows}
    daily_minutes = [
        {
            "date": (week_start + timedelta(days=i)).isoformat(),
            "minutes": by_day.get((week_start + timedelta(days=i)).isoformat(), 0) // 60,
        }
        for i in range(7)
    ]

    # ── 词汇/视频数：LearningEvent sums ──
    async def _event_sum(event_type: str) -> int:
        v = (
            (
                await db.execute(
                    select(func.coalesce(func.sum(LearningEvent.event_value), 0)).where(
                        LearningEvent.user_id == user_id,
                        LearningEvent.event_type == event_type,
                        LearningEvent.event_date >= week_start,
                        LearningEvent.event_date < week_end_date,
                    )
                )
            )
            .scalars()
            .one()
        )
        return int(v)

    new_words = await _event_sum("learned_words")
    reviewed_words = await _event_sum("reviewed_words")
    videos_completed = await _event_sum("completed_video")

    # 每日新学词汇（词汇增长曲线数据源，同 daily_minutes 保持 7 元素对齐）
    word_rows = (
        await db.execute(
            select(
                LearningEvent.event_date,
                func.coalesce(func.sum(LearningEvent.event_value), 0).label("w"),
            )
            .where(
                LearningEvent.user_id == user_id,
                LearningEvent.event_type == "learned_words",
                LearningEvent.event_date >= week_start,
                LearningEvent.event_date < week_end_date,
            )
            .group_by(LearningEvent.event_date)
        )
    ).all()
    words_by_day = {str(r.event_date): int(r.w) for r in word_rows}
    daily_new_words = [
        {
            "date": (week_start + timedelta(days=i)).isoformat(),
            "words": words_by_day.get((week_start + timedelta(days=i)).isoformat(), 0),
        }
        for i in range(7)
    ]

    # ── 学习天数：有 LearningEvent 的天数 ──
    study_days = (
        await db.execute(
            select(func.count(func.distinct(LearningEvent.event_date))).where(
                LearningEvent.user_id == user_id,
                LearningEvent.event_date >= week_start,
                LearningEvent.event_date < week_end_date,
            )
        )
    ).scalars().one() or 0

    # ── streak：取当前 profile 值（近似周末快照） ──
    profile = await db.scalar(select(UserLearningProfile).where(UserLearningProfile.user_id == user_id))
    streak = profile.current_streak if profile else 0

    # ── 环比：上一周时长，首周为 None ──
    prev_start_dt = start_dt - timedelta(days=7)
    prev_seconds = (
        (
            await db.execute(
                select(func.coalesce(func.sum(LearningRecord.time_spent_seconds), 0)).where(
                    LearningRecord.user_id == user_id,
                    LearningRecord.last_accessed_at >= prev_start_dt,
                    LearningRecord.last_accessed_at < start_dt,
                )
            )
        )
        .scalars()
        .one()
    )
    prev_minutes = int(prev_seconds) // 60
    if prev_minutes > 0:
        delta_minutes_pct = round((total_minutes - prev_minutes) / prev_minutes * 100, 1)
    else:
        delta_minutes_pct = None

    # ── 亮点：单日最长学习时长 ──
    max_day_minutes = max((d["minutes"] for d in daily_minutes), default=0)
    highlight = f"本周最长一次学习 {max_day_minutes} 分钟" if max_day_minutes > 0 else _HIGHLIGHT_FALLBACK

    report = WeeklyReport(
        user_id=user_id,
        week_start=week_start,
        study_days=int(study_days),
        total_minutes=total_minutes,
        new_words=new_words,
        reviewed_words=reviewed_words,
        videos_completed=videos_completed,
        streak_at_week_end=streak,
        delta_minutes_pct=delta_minutes_pct,
        daily_minutes=daily_minutes,
        daily_new_words=daily_new_words,
        highlight=highlight,
    )
    db.add(report)
    await db.flush()
    logger.info(
        "weekly_report_generated",
        user_id=user_id,
        week_start=week_start.isoformat(),
        total_minutes=total_minutes,
    )
    return report
