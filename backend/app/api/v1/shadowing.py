"""Shadowing API — sentence read-along recording endpoints.

POST /shadowing/attempts — create a shadowing attempt record
GET  /shadowing/attempts — list attempts by video (paginated)
GET  /shadowing/stats    — user shadowing statistics
"""

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.services import shadowing_service

router = APIRouter(prefix="/shadowing", tags=["shadowing"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CreateAttemptRequest(BaseModel):
    video_id: str
    subtitle_id: str | None = None
    audio_url: str
    duration_ms: int | None = None
    is_satisfied: bool = False


class AttemptResponse(BaseModel):
    id: str
    user_id: str
    video_id: str
    subtitle_id: str | None
    audio_url: str
    duration_ms: int | None
    is_satisfied: bool
    created_at: str | None


class AttemptListResponse(BaseModel):
    items: list[AttemptResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class ShadowingStatsResponse(BaseModel):
    total_attempts: int
    satisfied_count: int
    videos_shadowed: int
    today_count: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/attempts", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("60/minute")
async def create_attempt(
    body: CreateAttemptRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a shadowing attempt for a subtitle sentence."""
    return await shadowing_service.create_attempt(
        db,
        user_id=current_user.id,
        video_id=body.video_id,
        subtitle_id=body.subtitle_id,
        audio_url=body.audio_url,
        duration_ms=body.duration_ms,
        is_satisfied=body.is_satisfied,
    )


@router.get("/attempts", response_model=AttemptListResponse)
@rate_limit("30/minute")
async def list_attempts(
    request: Request,
    video_id: str = Query(..., description="Filter attempts by video"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List shadowing attempts for a video, newest first."""
    return await shadowing_service.list_by_video(
        db,
        user_id=current_user.id,
        video_id=video_id,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=ShadowingStatsResponse)
@rate_limit("30/minute")
async def shadowing_stats(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated shadowing statistics for the current user."""
    return await shadowing_service.get_stats(db, current_user.id)
