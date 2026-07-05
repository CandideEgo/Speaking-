"""Behavior collection service — ingest user interaction events (ADR-0011 P0).

Writes to the behavior_events table AND mirrors side-effects onto
LearningRecord (time_spent_seconds, completed) and Video.view_count. This
dual-write closes the long-standing LearningRecord gap — previously
time_spent_seconds / completed had no write path at all (position /
progress_percentage go through the existing /learning/progress endpoint,
which the frontend now calls for resume + periodic position saves).

Not a recommendation engine — just the data channel. Ranking/scoring live in
scoring_service / recommendation_service (P1/P2).
"""

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.behavior import BehaviorEvent
from app.models.learning import LearningRecord
from app.models.video import Video

# Event types that carry LearningRecord/Video side-effects beyond the raw log.
EVENT_WATCH_TIME = "watch_time"
EVENT_COMPLETE = "complete"


async def ingest_event(db: AsyncSession, event: dict, user_id: str | None) -> None:
    """Ingest one event: append to behavior_events + mirror side-effects.

    Does not commit — the caller (batch endpoint or single endpoint) commits.
    """
    video_id = event.get("video_id")
    event_type = event.get("event_type")
    payload = event.get("event_payload") or {}

    db.add(
        BehaviorEvent(
            user_id=user_id,
            video_id=video_id,
            event_type=event_type,
            event_payload=payload,
            session_id=event.get("session_id"),
            client_ts=event.get("client_ts"),
        )
    )

    # Side-effects only for logged-in users on a video-scoped event.
    if user_id and video_id:
        await _mirror_to_learning_record(db, user_id, video_id, event_type, payload)


async def ingest_batch(db: AsyncSession, events: list[dict], user_id: str | None) -> int:
    """Ingest a batch of events (frontend flush). Returns count ingested."""
    for ev in events:
        await ingest_event(db, ev, user_id)
    await db.commit()
    return len(events)


async def _mirror_to_learning_record(
    db: AsyncSession,
    user_id: str,
    video_id: str,
    event_type: str,
    payload: dict,
) -> None:
    """Update LearningRecord.time_spent_seconds / completed + Video.view_count.

    The LearningRecord row is created by video_service on first video open;
    we only update it if it exists (no upsert here — avoids a second creation
    path racing the unique constraint).
    """
    if event_type == EVENT_WATCH_TIME:
        delta = float(payload.get("delta_s", 0) or 0)
        if delta <= 0:
            return
        result = await db.execute(
            select(LearningRecord).where(
                LearningRecord.user_id == user_id,
                LearningRecord.video_id == video_id,
            )
        )
        record = result.scalar_one_or_none()
        if record:
            record.time_spent_seconds = (record.time_spent_seconds or 0) + int(delta)
            record.last_accessed_at = datetime.now(UTC)

    elif event_type == EVENT_COMPLETE:
        result = await db.execute(
            select(LearningRecord).where(
                LearningRecord.user_id == user_id,
                LearningRecord.video_id == video_id,
            )
        )
        record = result.scalar_one_or_none()
        if record:
            record.completed = True
            record.progress_percentage = 100.0
        # view_count increments per play-completion (not per unique user) —
        # matches the ADR's "播放完成次数" semantics.
        await db.execute(update(Video).where(Video.id == video_id).values(view_count=Video.view_count + 1))
