"""Audit reproduction restricted to disposable SQLite or the named audit DB."""
import asyncio
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

import app.models  # noqa: F401,E402
from app.core.database import Base  # noqa: E402
from app.models.learning import LearningRecord  # noqa: E402
from app.models.user import PlanType, User  # noqa: E402
from app.models.video import Video  # noqa: E402
from app.services import admin_service  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy import func, select  # noqa: E402


async def zero():
    return 0


async def main():
    audit_url = os.environ.get("AUDIT_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    if audit_url not in {
        "sqlite+aiosqlite:///:memory:",
        "postgresql+asyncpg://audit:audit-disposable-only@127.0.0.1:15432/seeword_audit",
    }:
        raise RuntimeError("Refuse to use a non-disposable audit database")
    engine = create_async_engine(audit_url)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    admin_service._count_online = zero
    admin_service._gpu_queue_depth = zero
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        now = datetime.now(UTC)
        yesterday = now - timedelta(days=1)
        reader = User(name="reader", phone="13000000001")
        member = User(name="trial-no-watch", phone="13000000002", plan=PlanType.pro, plan_source="trial", plan_expires_at=now+timedelta(days=3))
        db.add_all([reader, member])
        await db.flush()
        video = Video(user_id=reader.id, title="audit fixture", source_url="https://example.invalid/audit")
        db.add(video)
        await db.flush()
        record = LearningRecord(user_id=reader.id, video_id=video.id, last_accessed_at=yesterday)
        db.add(record)
        await db.commit()
        before = await admin_service._compute_admin_stats(db, days=3)
        async def activity_buckets():
            rows = (await db.execute(
                select(func.date(LearningRecord.last_accessed_at), func.count(func.distinct(LearningRecord.user_id)))
                .where(LearningRecord.last_accessed_at >= now - timedelta(days=3))
                .group_by(func.date(LearningRecord.last_accessed_at))
            )).all()
            return {str(day): count for day, count in rows}
        before_buckets = await activity_buckets()
        record.last_accessed_at = now
        await db.commit()
        after = await admin_service._compute_admin_stats(db, days=3)
        after_buckets = await activity_buckets()
        result = {
            "fixture": "2 registered, one watcher, zero vocabulary savers, one active trial member who never watched",
            "dates": before["trend"]["dates"],
            "dialect": engine.dialect.name,
            "grouped_sql_before_revisit": before_buckets,
            "grouped_sql_after_revisit": after_buckets,
            "api_trend_before": before["trend"]["active_users"],
            "api_trend_after": after["trend"]["active_users"],
            "sqlite_caveat": "SQLite func.date returns strings while code's dates are datetime.date; full API trend is not a PostgreSQL reproduction. Grouped SQL above demonstrates the moving historical bucket.",
            "funnel": after["funnel"],
            "historical_active_day_disappeared": before_buckets.get(str(yesterday.date()), 0) == 1 and after_buckets.get(str(yesterday.date()), 0) == 0,
            "non_nested_funnel_confirmed": after["funnel"]["pro"] > after["funnel"]["vocab_saved"],
            "trial_counted_as_pro": after["funnel"]["pro"] == 1,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        assert result["historical_active_day_disappeared"]
        assert result["non_nested_funnel_confirmed"]
        assert result["trial_counted_as_pro"]
    await engine.dispose()


asyncio.run(main())
