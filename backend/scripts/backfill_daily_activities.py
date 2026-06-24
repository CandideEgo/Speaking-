"""Backfill daily_activities from existing speaking_attempts and vocabulary.

Run once after the migration to populate historical daily activity data.
Idempotent — skips if a DailyActivity already exists for that user+date.

Usage:
    cd backend
    python backfill_daily_activities.py
    python backfill_daily_activities.py --dry-run
"""

import argparse
import asyncio
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import get_settings
from app.models.daily_activity import DailyActivity
from app.models.learning import SpeakingAttempt, Vocabulary
from app.models.user import User


async def backfill(dry_run: bool = False):
    settings = get_settings()
    engine = create_async_engine(settings.database_url)

    from sqlalchemy.orm import sessionmaker

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Get all users
        result = await db.execute(select(User))
        users = result.scalars().all()
        print(f"Found {len(users)} users")

        total_created = 0

        for user in users:
            # ── Speaking attempts by date ──
            sa_result = await db.execute(
                select(
                    func.date_trunc("day", SpeakingAttempt.created_at).label("day"),
                    func.count(SpeakingAttempt.id).label("count"),
                    func.avg(SpeakingAttempt.accuracy).label("avg_acc"),
                    func.avg(SpeakingAttempt.fluency).label("avg_flu"),
                    func.avg(SpeakingAttempt.completeness).label("avg_comp"),
                )
                .where(SpeakingAttempt.user_id == user.id)
                .group_by("day")
                .order_by("day")
            )

            for row in sa_result:
                if row.day is None:
                    continue
                target_date = row.day.date() if hasattr(row.day, "date") else row.day

                # Check if already exists
                existing = await db.execute(
                    select(DailyActivity).where(
                        DailyActivity.user_id == user.id,
                        DailyActivity.date == target_date,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                if not dry_run:
                    activity = DailyActivity(
                        user_id=user.id,
                        date=target_date,
                        speaking_attempts=row.count,
                        avg_accuracy=round(float(row.avg_acc or 0), 1),
                        avg_fluency=round(float(row.avg_flu or 0), 1),
                        avg_completeness=round(float(row.avg_comp or 0), 1),
                    )
                    db.add(activity)
                total_created += 1

            # ── Vocabulary added by date ──
            va_result = await db.execute(
                select(
                    func.date_trunc("day", Vocabulary.created_at).label("day"),
                    func.count(Vocabulary.id).label("count"),
                )
                .where(Vocabulary.user_id == user.id)
                .group_by("day")
            )

            for row in va_result:
                if row.day is None:
                    continue
                target_date = row.day.date() if hasattr(row.day, "date") else row.day

                # Get or create daily activity
                existing_result = await db.execute(
                    select(DailyActivity).where(
                        DailyActivity.user_id == user.id,
                        DailyActivity.date == target_date,
                    )
                )
                activity = existing_result.scalar_one_or_none()

                if activity:
                    if activity.words_added == 0:
                        activity.words_added = row.count
                elif not dry_run:
                    activity = DailyActivity(
                        user_id=user.id,
                        date=target_date,
                        words_added=row.count,
                    )
                    db.add(activity)
                    total_created += 1

            # ── Vocabulary reviewed by date ──
            vr_result = await db.execute(
                select(
                    func.date_trunc("day", Vocabulary.last_reviewed_at).label("day"),
                    func.count(Vocabulary.id).label("count"),
                )
                .where(
                    Vocabulary.user_id == user.id,
                    Vocabulary.last_reviewed_at.isnot(None),
                )
                .group_by("day")
            )

            for row in vr_result:
                if row.day is None:
                    continue
                target_date = row.day.date() if hasattr(row.day, "date") else row.day

                existing_result = await db.execute(
                    select(DailyActivity).where(
                        DailyActivity.user_id == user.id,
                        DailyActivity.date == target_date,
                    )
                )
                activity = existing_result.scalar_one_or_none()

                if activity:
                    if activity.words_reviewed == 0:
                        activity.words_reviewed = row.count
                elif not dry_run:
                    activity = DailyActivity(
                        user_id=user.id,
                        date=target_date,
                        words_reviewed=row.count,
                    )
                    db.add(activity)
                    total_created += 1

            if not dry_run:
                await db.commit()

        # ── Compute streaks ──
        print(f"\n{'Would create' if dry_run else 'Created'} {total_created} daily activity records")

        if not dry_run and total_created > 0:
            print("\nComputing streaks...")
            from app.services.activity_service import update_streak

            for user in users:
                await update_streak(db, user.id)
            await db.commit()
            print("Streaks computed for all users")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill daily_activities from historical data")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    args = parser.parse_args()

    asyncio.run(backfill(dry_run=args.dry_run))
