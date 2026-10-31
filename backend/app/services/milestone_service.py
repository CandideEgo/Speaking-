"""Historical milestone reads and vocabulary mastery snapshots."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.milestone import MasterySnapshot


async def check_and_award(db: AsyncSession, user_id: str) -> list[dict]:
    """Compatibility service: learning activity no longer awards achievements."""
    return []


async def get_mastery_trend(db: AsyncSession, user_id: str, weeks: int = 8) -> list[dict]:
    """Get mastery snapshots for the last N weeks, ordered by date asc."""
    from datetime import timedelta

    cutoff = date.today() - timedelta(weeks=weeks)
    result = await db.execute(
        select(MasterySnapshot)
        .where(
            MasterySnapshot.user_id == user_id,
            MasterySnapshot.snapshot_date >= cutoff,
        )
        .order_by(MasterySnapshot.snapshot_date.asc())
    )
    snapshots = result.scalars().all()
    return [
        {
            "date": s.snapshot_date.isoformat(),
            "mastery_json": s.mastery_json,
        }
        for s in snapshots
    ]


async def ensure_today_snapshot(db: AsyncSession, user_id: str, today: date, mastery_by_level: dict | None) -> None:
    """Write a mastery snapshot for today if one doesn't already exist.

    Lightweight: reads from the profile's cached mastery_by_level, does not
    recompute from raw data.
    """
    # Check if snapshot already exists for today
    existing = await db.execute(
        select(MasterySnapshot.id).where(
            MasterySnapshot.user_id == user_id,
            MasterySnapshot.snapshot_date == today,
        )
    )
    if existing.scalar_one_or_none():
        return

    snapshot = MasterySnapshot(
        user_id=user_id,
        snapshot_date=today,
        mastery_json=mastery_by_level,
    )
    db.add(snapshot)
    await db.flush()
