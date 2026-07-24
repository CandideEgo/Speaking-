"""Learning plan API — daily plan, progress, profile, and history (ADR-0012).

Endpoints:
  GET  /plan/today           — Today's plan + progress + profile (combined)
  POST /plan/items/{id}/complete — Mark a plan item as completed
  GET  /plan/progress        — Today's progress only
  GET  /plan/profile         — Learning profile
  POST /plan/profile/refresh — Force-refresh profile from raw data
  GET  /plan/history         — Paginated plan history
  POST /plan/generate/ai     — AI-powered plan generation (Pro-only)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.learning_plan import (
    AIPlanGenerateResponse,
    DailyProgressResponse,
    LearningProfileResponse,
    PlanHistoryItem,
    PlanItemCompleteRequest,
    PlanItemCompleteResponse,
    PlanResponse,
    TodayPlanResponse,
)
from app.schemas.pagination import PaginatedResponse, paginated
from app.services import learning_event_service, learning_plan_service, profile_service

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("/today", response_model=TodayPlanResponse)
@rate_limit("30/minute")
async def get_today_plan(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get today's learning plan with progress and profile."""
    # Generate plan if not exists
    plan_dict = await learning_plan_service.generate_daily_plan(db, current_user.id)

    # Get progress
    progress_dict = await learning_event_service.get_today_progress(db, current_user.id)

    # Get profile
    profile_dict = await profile_service.get_or_create_profile(db, current_user.id)
    profile_resp = LearningProfileResponse(
        estimated_level=profile_dict.estimated_level,
        current_streak=profile_dict.current_streak,
        longest_streak=profile_dict.longest_streak,
        weekly_cycles_completed=profile_dict.weekly_cycles_completed,
        mastery_by_level=profile_dict.mastery_by_level,
        strengths=profile_dict.strengths,
        weaknesses=profile_dict.weaknesses,
    )

    # Build plan response
    plan_resp = PlanResponse(**plan_dict) if plan_dict else None

    progress_resp = DailyProgressResponse(**progress_dict)

    return TodayPlanResponse(
        plan=plan_resp,
        progress=progress_resp,
        profile=profile_resp,
    )


@router.post("/items/{item_id}/complete", response_model=PlanItemCompleteResponse)
@rate_limit("10/minute")
async def complete_plan_item(
    request: Request,
    item_id: str,
    body: PlanItemCompleteRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a plan item as completed. Emits LearningEvent."""
    # We need the plan_id to verify ownership — extract from the item
    from sqlalchemy import select

    from app.models.learning_plan import LearningPlan, LearningPlanItem

    result = await db.execute(select(LearningPlanItem).where(LearningPlanItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Plan item not found")

    # Verify plan ownership
    plan_result = await db.execute(
        select(LearningPlan).where(
            LearningPlan.id == item.plan_id,
            LearningPlan.user_id == current_user.id,
        )
    )
    if not plan_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Plan not found")

    try:
        result = await learning_plan_service.mark_plan_item_completed(
            db,
            item.plan_id,
            item_id,
            current_user.id,
            result_data=body.result if body else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    return PlanItemCompleteResponse(**result)


@router.get("/progress", response_model=DailyProgressResponse)
@rate_limit("30/minute")
async def get_today_progress(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get today's learning progress without the full plan."""
    progress_dict = await learning_event_service.get_today_progress(db, current_user.id)
    return DailyProgressResponse(**progress_dict)


@router.get("/profile", response_model=LearningProfileResponse)
@rate_limit("30/minute")
async def get_learning_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the user's learning profile."""
    profile = await profile_service.get_or_create_profile(db, current_user.id)
    return LearningProfileResponse(
        estimated_level=profile.estimated_level,
        current_streak=profile.current_streak,
        longest_streak=profile.longest_streak,
        weekly_cycles_completed=profile.weekly_cycles_completed,
        mastery_by_level=profile.mastery_by_level,
        strengths=profile.strengths,
        weaknesses=profile.weaknesses,
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


@router.get("/history", response_model=PaginatedResponse[PlanHistoryItem])
@rate_limit("30/minute")
async def get_plan_history(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated history of past learning plans."""
    result = await learning_plan_service.get_plan_history(db, current_user.id, page, page_size)
    items = [PlanHistoryItem(**item) for item in result["items"]]
    return paginated(
        items,
        page=result["page"],
        page_size=result["page_size"],
        total=result["total"],
    )


@router.post("/generate/ai", response_model=AIPlanGenerateResponse)
@rate_limit("3/minute")
async def generate_ai_plan(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI-powered learning plan."""
    try:
        from app.services.ai_plan_service import generate_ai_plan as _generate

        plan_dict = await _generate(db, current_user.id)
        return AIPlanGenerateResponse(
            status="completed",
            plan_id=plan_dict.get("id"),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI plan generation failed: {e}") from e
