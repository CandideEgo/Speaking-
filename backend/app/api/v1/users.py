from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.user import (
    MessageResponse,
    OnboardingRequest,
    UserPreferencesResponse,
    UserPreferencesUpdate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
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
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post("/me/onboarding", response_model=MessageResponse)
async def complete_onboarding(
    data: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark onboarding as completed for the current user."""
    current_user.onboarding_completed = data.onboarding_completed
    await db.commit()
    return MessageResponse(message="Onboarding status updated")


@router.get("/me/preferences", response_model=UserPreferencesResponse)
async def get_preferences(
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
            daily_goal_type=pref_row.daily_goal_type or "speaking_attempts",
            daily_goal_value=pref_row.daily_goal_value or 5,
            reminder_enabled=pref_row.reminder_enabled if pref_row.reminder_enabled is not None else True,
            reminder_time=pref_row.reminder_time,
            reminder_timezone=pref_row.reminder_timezone,
            auto_play_next_subtitle=pref_row.auto_play_next_subtitle
            if pref_row.auto_play_next_subtitle is not None
            else True,
            subtitle_mode_default=pref_row.subtitle_mode_default or "bilingual",
            preferred_difficulty=pref_row.preferred_difficulty,
        )

    # Return defaults
    return UserPreferencesResponse()


@router.put("/me/preferences", response_model=UserPreferencesResponse)
async def update_preferences(
    data: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's learning preferences.

    Creates the preference row if it doesn't exist (upsert).
    """
    from sqlalchemy import select

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

    await db.commit()
    await db.refresh(pref)

    return UserPreferencesResponse(
        daily_goal_type=pref.daily_goal_type or "speaking_attempts",
        daily_goal_value=pref.daily_goal_value or 5,
        reminder_enabled=pref.reminder_enabled if pref.reminder_enabled is not None else True,
        reminder_time=pref.reminder_time,
        reminder_timezone=pref.reminder_timezone,
        auto_play_next_subtitle=pref.auto_play_next_subtitle if pref.auto_play_next_subtitle is not None else True,
        subtitle_mode_default=pref.subtitle_mode_default or "bilingual",
        preferred_difficulty=pref.preferred_difficulty,
    )
