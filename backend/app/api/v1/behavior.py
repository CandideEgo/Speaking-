"""Behavior events API — P0 behavior collection (ADR-0011).

Accepts single + batch event ingests. Anonymous events allowed (user_id NULL)
so click tracking on public pages works without login; logged-in events carry
the user_id for personalization and LearningRecord side-effects.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_optional_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.behavior import (
    BehaviorBatchRequest,
    BehaviorEventRequest,
    BehaviorIngestResponse,
)
from app.services.behavior_service import drop_unknown_video_ids, ingest_batch, ingest_event
from app.services.video_cache import invalidate_view_caches

router = APIRouter(prefix="/behavior", tags=["behavior"])


@router.post("/events", response_model=BehaviorIngestResponse)
@rate_limit("120/minute")
async def post_event(
    request: Request,
    body: BehaviorEventRequest,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Ingest a single behavior event."""
    events = await drop_unknown_video_ids(db, [body.model_dump()])
    applied = await ingest_event(db, events[0], current_user.id if current_user else None)
    await db.commit()
    # Only a *new* completion changes the hot/weekly counters; a replayed
    # complete must not delete every browse/rankings cache key again.
    if current_user and applied and body.event_type == "complete" and body.video_id:
        await invalidate_view_caches(body.video_id)
    return BehaviorIngestResponse(ingested=1)


@router.post("/events/batch", response_model=BehaviorIngestResponse)
@rate_limit("60/minute")
async def post_batch(
    request: Request,
    body: BehaviorBatchRequest,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Ingest a batch of behavior events (frontend analytics flush)."""
    events = await drop_unknown_video_ids(db, [e.model_dump() for e in body.events])
    count, complete_applied = await ingest_batch(
        db,
        events,
        current_user.id if current_user else None,
    )
    if current_user and complete_applied:
        completed_video_ids = {
            event.get("video_id") for event in events if event.get("event_type") == "complete" and event.get("video_id")
        }
        for video_id in completed_video_ids:
            await invalidate_view_caches(video_id)
    return BehaviorIngestResponse(ingested=count)
