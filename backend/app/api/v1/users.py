import uuid
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import commit_refresh, get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.user import (
    MessageResponse,
    OnboardingRequest,
    UserPreferencesResponse,
    UserPreferencesUpdate,
    UserResponse,
    UserUpdate,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

# Avatar upload constraints.
_AVATAR_MAX_SIZE = 5 * 1024 * 1024  # 5 MB
_AVATAR_ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


@router.get("/me", response_model=UserResponse)
@rate_limit("30/minute")
async def get_me(request: Request, current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
@rate_limit("10/minute")
async def update_me(
    request: Request,
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.name is not None:
        current_user.name = data.name
    if data.level is not None:
        current_user.level = data.level
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url
    if data.bio is not None:
        current_user.bio = data.bio
    if data.timezone is not None:
        current_user.timezone = data.timezone
    await commit_refresh(db, current_user)
    return UserResponse.model_validate(current_user)


@router.post("/me/avatar", response_model=UserResponse)
@rate_limit("10/minute")
async def upload_avatar(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
):
    """Upload an avatar image (JPG/PNG/WebP/GIF, ≤5MB).

    Stored locally under ``/media/avatars/`` and served via the existing
    ``GET /api/v1/media/{path}`` handler; the relative path is stored on
    ``user.avatar_url`` so the frontend ``mediaUrl()`` resolves it against
    ``API_URL``.
    """
    ext = _AVATAR_ALLOWED_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 JPG/PNG/WebP/GIF 图片",
        )
    contents = await file.read()
    if len(contents) > _AVATAR_MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="图片过大，最大 5MB",
        )
    settings = get_settings()
    avatar_dir = Path(settings.local_media_path) / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    (avatar_dir / filename).write_bytes(contents)
    current_user.avatar_url = f"/media/avatars/{filename}"
    await commit_refresh(db, current_user)
    logger.info("avatar_uploaded", user_id=current_user.id)
    return UserResponse.model_validate(current_user)


@router.post("/me/onboarding", response_model=MessageResponse)
@rate_limit("5/minute")
async def complete_onboarding(
    request: Request,
    data: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark onboarding as completed for the current user."""
    current_user.onboarding_completed = data.onboarding_completed
    await db.commit()
    return MessageResponse(message="Onboarding status updated")


@router.get("/me/preferences", response_model=UserPreferencesResponse)
@rate_limit("30/minute")
async def get_preferences(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's learning preferences.

    Returns defaults if no preferences have been saved yet.
    """
    from app.models.preferences import UserPreferences

    result = await db.execute(UserPreferences.__table__.select().where(UserPreferences.user_id == current_user.id))
    pref_row = result.first()

    if pref_row:
        return UserPreferencesResponse(
            daily_goal_type=pref_row.daily_goal_type or "words",
            daily_goal_value=pref_row.daily_goal_value or 5,
            reminder_enabled=pref_row.reminder_enabled if pref_row.reminder_enabled is not None else True,
            reminder_time=pref_row.reminder_time,
            reminder_timezone=pref_row.reminder_timezone,
            auto_play_next_subtitle=pref_row.auto_play_next_subtitle
            if pref_row.auto_play_next_subtitle is not None
            else True,
            subtitle_mode_default=pref_row.subtitle_mode_default or "bilingual",
            preferred_difficulty=pref_row.preferred_difficulty,
            target_exam=pref_row.target_exam,
        )

    # Return defaults
    return UserPreferencesResponse()


@router.put("/me/preferences", response_model=UserPreferencesResponse)
@rate_limit("10/minute")
async def update_preferences(
    request: Request,
    data: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's learning preferences.

    Creates the preference row if it doesn't exist (upsert).
    """

    from app.models.preferences import UserPreferences

    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    pref = result.scalar_one_or_none()

    if not pref:
        pref = UserPreferences(user_id=current_user.id)
        db.add(pref)

    update_data = data.model_dump(exclude_none=True)
    for key, value in update_data.items():
        if hasattr(pref, key):
            setattr(pref, key, value)

    await commit_refresh(db, pref)

    return UserPreferencesResponse(
        daily_goal_type=pref.daily_goal_type or "words",
        daily_goal_value=pref.daily_goal_value or 5,
        reminder_enabled=pref.reminder_enabled if pref.reminder_enabled is not None else True,
        reminder_time=pref.reminder_time,
        reminder_timezone=pref.reminder_timezone,
        auto_play_next_subtitle=pref.auto_play_next_subtitle if pref.auto_play_next_subtitle is not None else True,
        subtitle_mode_default=pref.subtitle_mode_default or "bilingual",
        preferred_difficulty=pref.preferred_difficulty,
        target_exam=pref.target_exam,
    )
