"""Learning profile API — profile, milestones, mastery trend.

Endpoints:
  GET  /plan/profile         — Learning profile
  POST /plan/profile/refresh — Force-refresh profile from raw data
  GET  /plan/mastery-trend   — Mastery snapshots for trend chart
  GET  /plan/milestones      — Achieved milestones

The daily-plan endpoints this router once served (today / items/{id}/complete /
progress / history / generate/ai) are gone — with the tables behind them, in
``d1e2f3a4b5c6``. They answered 410 Gone from 2026-08-27 until then, and
nothing called them.
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
from app.services import milestone_service, profile_service, study_session_service
from app.services.local_time import get_user_local_now

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("/profile", response_model=LearningProfileResponse)
@rate_limit("30/minute")
async def get_learning_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the user's learning profile with milestones."""
    profile = await profile_service.get_or_create_profile(db, current_user.id)
    # today_words_learned comes from the same source the 今日 tab reads, so the
    # two can never disagree (the counter is per-user-local-date, and a stale
    # profile row means zero rather than yesterday's number).
    today = await study_session_service.get_today_summary(db, current_user.id)
    # 首页问候与日期标签的基准（BUG-05）：与今日计数、连续天数同一个用户本地日。
    local_now = await get_user_local_now(db, current_user.id)
    return LearningProfileResponse(
        estimated_level=profile.estimated_level,
        current_streak=profile.current_streak,
        longest_streak=profile.longest_streak,
        weekly_cycles_completed=profile.weekly_cycles_completed,
        mastery_by_level=profile.mastery_by_level,
        strengths=profile.strengths,
        weaknesses=profile.weaknesses,
        milestones=[],
        today_words_learned=today["words_learned"],
        local_date=local_now.date().isoformat(),
        local_hour=local_now.hour,
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
    # refresh_profile recomputes the aggregates; the daily counter is not one of
    # them (it is incremented by events), so it is filled in here to keep this
    # response identical in shape to GET /plan/profile.
    today = await study_session_service.get_today_summary(db, current_user.id)
    local_now = await get_user_local_now(db, current_user.id)
    return LearningProfileResponse(
        **profile_dict,
        milestones=[],
        today_words_learned=today["words_learned"],
        local_date=local_now.date().isoformat(),
        local_hour=local_now.hour,
    )


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
    from app.services.retired_features import feature_gone

    feature_gone()
