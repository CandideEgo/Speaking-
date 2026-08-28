"""Learning profile API — profile, milestones, mastery trend.

The daily-plan / plan-item / history / AI-generation endpoints were removed
on 2026-08-27 (learning-plan task assignment was cut). They return 410 Gone so
old clients get a clear signal instead of 404.

Endpoints:
  GET  /plan/profile         — Learning profile
  POST /plan/profile/refresh — Force-refresh profile from raw data
  GET  /plan/mastery-trend   — Mastery snapshots for trend chart
  GET  /plan/milestones      — Achieved milestones

Removed (410 Gone):
  GET  /plan/today
  POST /plan/items/{id}/complete
  GET  /plan/progress
  GET  /plan/history
  POST /plan/generate/ai
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.learning_plan import (
    LearningProfileResponse,
    MasterySnapshotItem,
    MasteryTrendResponse,
    MilestoneResponse,
)
from app.services import milestone_service, profile_service

router = APIRouter(prefix="/plan", tags=["plan"])

_GONE = {"message": "This endpoint has been removed.", "code": "GONE"}


@router.get("/today", status_code=410)
@rate_limit("30/minute")
async def get_today_plan(request: Request):
    """Removed: daily learning plan."""
    return _GONE


@router.post("/items/{item_id}/complete", status_code=410)
@rate_limit("10/minute")
async def complete_plan_item(request: Request, item_id: str):
    """Removed: plan item completion."""
    return _GONE


@router.get("/progress", status_code=410)
@rate_limit("30/minute")
async def get_today_progress(request: Request):
    """Removed: daily plan progress."""
    return _GONE


@router.get("/history", status_code=410)
@rate_limit("30/minute")
async def get_plan_history(request: Request):
    """Removed: plan history."""
    return _GONE


@router.post("/generate/ai", status_code=410)
@rate_limit("3/minute")
async def generate_ai_plan(request: Request):
    """Removed: AI plan generation."""
    return _GONE


@router.get("/profile", response_model=LearningProfileResponse)
@rate_limit("30/minute")
async def get_learning_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the user's learning profile with milestones."""
    profile = await profile_service.get_or_create_profile(db, current_user.id)
    milestones = await milestone_service.get_user_milestones(db, current_user.id)
    return LearningProfileResponse(
        estimated_level=profile.estimated_level,
        current_streak=profile.current_streak,
        longest_streak=profile.longest_streak,
        weekly_cycles_completed=profile.weekly_cycles_completed,
        mastery_by_level=profile.mastery_by_level,
        strengths=profile.strengths,
        weaknesses=profile.weaknesses,
        milestones=[MilestoneResponse(**m) for m in milestones],
    )


@router.post("/profile/refresh", response_model=LearningProfileResponse)
@rate_limit("5/minute")
async def refresh_learning_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Force-refresh the learning profile from raw data."""
    profile_dict = await profile_service.refresh_profile(db, current_user.id)
    return LearningProfileResponse(**profile_dict)


@router.get("/mastery-trend", response_model=MasteryTrendResponse)
@rate_limit("30/minute")
async def get_mastery_trend(
    request: Request,
    weeks: int = Query(8, ge=1, le=52),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get mastery snapshots for the last N weeks (trend chart data)."""
    snapshots = await milestone_service.get_mastery_trend(db, current_user.id, weeks)
    return MasteryTrendResponse(snapshots=[MasterySnapshotItem(**s) for s in snapshots])


@router.get("/milestones", response_model=list[MilestoneResponse])
@rate_limit("30/minute")
async def get_milestones(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all milestones achieved by the user."""
    milestones = await milestone_service.get_user_milestones(db, current_user.id)
    return [MilestoneResponse(**m) for m in milestones]
