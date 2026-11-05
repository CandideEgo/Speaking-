"""Strict teaching outbox projection; no legacy activity counters are touched."""

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning_plan import LearningEvent
from app.models.teaching import LearningEventOutbox

logger = logging.getLogger(__name__)


async def deliver_pending_events(db: AsyncSession, *, limit=100) -> int:
    """Project facts and delivery receipt in the caller's single transaction.

    The event UUID equals the outbox UUID, providing a DB-enforced idempotency
    key. A failed row rolls back its projection, records retry/dead state, and
    leaves the original attempt intact. The caller commits the delivery batch.
    Teaching is deliberately excluded from daily goals, mastery and streak.
    """
    now = datetime.now(UTC)
    rows = (
        await db.execute(
            select(LearningEventOutbox)
            .where(LearningEventOutbox.status == "pending", LearningEventOutbox.next_attempt_at <= now)
            .order_by(LearningEventOutbox.occurred_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    ).scalars()
    count = 0
    for row in rows:
        event_id = row.event_id
        try:
            async with db.begin_nested():
                if row.event_type != "teaching_attempt":
                    raise ValueError("Unknown teaching event contract")
                insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
                await db.execute(
                    insert(LearningEvent)
                    .values(
                        id=row.event_id,
                        user_id=row.user_id,
                        event_type=row.event_type,
                        event_value=1,
                        event_metadata={
                            **row.payload,
                            "attempt_id": row.attempt_id,
                            "actor": row.actor,
                            "origin_event_id": row.event_id,
                        },
                        flow_id=row.flow_id,
                        source="teaching",
                        schema_version=3,
                        event_date=date.fromisoformat(row.payload["event_date"]),
                        created_at=row.occurred_at,
                    )
                    .on_conflict_do_nothing(index_elements=["id"])
                )
                row.status = "delivered"
                row.attempts += 1
                row.last_error = None
                await db.flush()
            count += 1
        except Exception as exc:
            # A failed savepoint may expire the ORM identity; reload explicitly
            # instead of causing implicit async IO through attribute access.
            failed = await db.get(LearningEventOutbox, event_id, populate_existing=True)
            if failed is None:
                raise
            failed.attempts += 1
            failed.last_error = type(exc).__name__
            failed.next_attempt_at = now + timedelta(seconds=min(3600, 2**failed.attempts * 30))
            if failed.attempts >= 5:
                failed.status = "dead"
                logger.error("teaching_event_delivery_dead event_id=%s error=%s", event_id, type(exc).__name__)
    await db.flush()
    return count
