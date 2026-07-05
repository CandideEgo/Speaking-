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
from app.services.behavior_service import ingest_batch, ingest_event

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
    await ingest_event(db, body.model_dump(), current_user.id if current_user else None)
    await db.commit()
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
    count = await ingest_batch(
        db,
        [e.model_dump() for e in body.events],
        current_user.id if current_user else None,
    )
    return BehaviorIngestResponse(ingested=count)
