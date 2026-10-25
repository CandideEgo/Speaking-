import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import commit_refresh, get_db
from app.core.limiter import rate_limit
from app.core.uploads import read_upload_bounded
from app.models.user import User
from app.schemas.overview import OverviewResponse
from app.schemas.user import (
    DeletionRequest,
    DeletionStatusResponse,
    ExportStatusResponse,
    ExportTaskResponse,
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


@router.get("/me/overview", response_model=OverviewResponse)
@rate_limit("30/minute")
async def get_my_overview(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """One read model for 我的 / 发现右栏: streak, time, words, exams, library.

    Previously the client combined five endpoints and still could not show
    cumulative days or minutes. See ``services/overview_service.py``.
    """
    from app.services.overview_service import build_overview

    return await build_overview(db, current_user)


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
    if data.gender is not None:
        current_user.gender = data.gender
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
    contents = await read_upload_bounded(
        request,
        file,
        _AVATAR_MAX_SIZE,
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
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
            auto_advance_on_correct=bool(pref_row.auto_advance_on_correct),
            subtitle_mode_default=pref_row.subtitle_mode_default or "bilingual",
            subtitle_font_size=pref_row.subtitle_font_size or "medium",
            preferred_difficulty=pref_row.preferred_difficulty,
            target_exam=pref_row.target_exam,
            interest_categories=pref_row.interest_categories or [],
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
    if "interest_categories" in update_data:
        from app.core.cache import cache_delete

        await cache_delete(f"recommend:home:{current_user.id}:*")
        await cache_delete(f"recommend:category:{current_user.id}:*")

    return UserPreferencesResponse(
        daily_goal_type=pref.daily_goal_type or "words",
        daily_goal_value=pref.daily_goal_value or 5,
        reminder_enabled=pref.reminder_enabled if pref.reminder_enabled is not None else True,
        reminder_time=pref.reminder_time,
        reminder_timezone=pref.reminder_timezone,
        auto_play_next_subtitle=pref.auto_play_next_subtitle if pref.auto_play_next_subtitle is not None else True,
        auto_advance_on_correct=bool(pref.auto_advance_on_correct),
        subtitle_mode_default=pref.subtitle_mode_default or "bilingual",
        subtitle_font_size=pref.subtitle_font_size or "medium",
        preferred_difficulty=pref.preferred_difficulty,
        target_exam=pref.target_exam,
        interest_categories=pref.interest_categories or [],
    )


# ── 30-day cancellable deletion (P1-7) ──────────────────────────────

# Grace period before the daily purge task actually deletes the account.
DELETION_GRACE_DAYS = 30


def _deletion_status_response(user: User) -> DeletionStatusResponse:
    if user.deletion_scheduled_at is None:
        return DeletionStatusResponse(scheduled=False)
    scheduled = user.deletion_scheduled_at
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=UTC)
    # Round up so "scheduled 30 days out" reads as 30, not 29 (the fresh delta
    # is 30 days minus a few microseconds).
    delta_seconds = (scheduled - datetime.now(UTC)).total_seconds()
    remaining = -(-int(delta_seconds) // 86400)
    return DeletionStatusResponse(
        scheduled=True,
        requested_at=user.deletion_requested_at,
        scheduled_at=user.deletion_scheduled_at,
        days_remaining=max(0, remaining),
        reason=user.deletion_reason,
    )


@router.get("/me/deletion", response_model=DeletionStatusResponse)
@rate_limit("30/minute")
async def get_deletion_status(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Current deletion countdown — drives the persistent banner in the UI."""
    return _deletion_status_response(current_user)


@router.post("/me/deletion", response_model=DeletionStatusResponse)
@rate_limit("10/minute")
async def request_deletion(
    request: Request,
    data: DeletionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Request account deletion with a 30-day grace period (idempotent).

    Requires the explicit second confirmation (``confirm=True``). Scheduling
    twice keeps the original ``scheduled_at`` so the countdown never silently
    extends. Login and every other endpoint stay usable during the window; the
    account is only cancelled by the explicit DELETE.
    """
    if not data.confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请确认注销操作")
    if current_user.deletion_scheduled_at is None:
        now = datetime.now(UTC)
        current_user.deletion_requested_at = now
        current_user.deletion_scheduled_at = now + timedelta(days=DELETION_GRACE_DAYS)
        current_user.deletion_reason = data.reason
        await commit_refresh(db, current_user)
        logger.info("account_deletion_requested", user_id=current_user.id)
    return _deletion_status_response(current_user)


@router.delete("/me/deletion", response_model=MessageResponse)
@rate_limit("10/minute")
async def cancel_deletion(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending deletion and clear every countdown field (idempotent)."""
    if current_user.deletion_scheduled_at is not None:
        current_user.deletion_requested_at = None
        current_user.deletion_scheduled_at = None
        current_user.deletion_reason = None
        await commit_refresh(db, current_user)
        logger.info("account_deletion_cancelled", user_id=current_user.id)
    return MessageResponse(message="注销已撤销")


# ── Async data export (P1-7) ────────────────────────────────────────

# Download handshake TTL for a ready export.
EXPORT_URL_TTL_SECONDS = 15 * 60


def _as_utc(value: datetime | None) -> datetime | None:
    """SQLite drops tzinfo on round-trip; normalise before comparing to now."""
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


@router.get("/me/export", response_model=ExportTaskResponse)
@rate_limit("5/minute")
async def create_export(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Queue a ZIP export of the caller's data (returns task id + status).

    Reuses the newest pending/running task so a double-click doesn't build the
    archive twice.
    """
    from app.models.data_export import DataExportTask

    existing = (
        await db.execute(
            select(DataExportTask)
            .where(DataExportTask.user_id == current_user.id, DataExportTask.status.in_(["pending", "running"]))
            .order_by(DataExportTask.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return ExportTaskResponse(task_id=existing.id, status=existing.status, created_at=existing.created_at)

    task = DataExportTask(user_id=current_user.id, status="pending")
    db.add(task)
    await commit_refresh(db, task)

    from app.tasks.account_tasks import build_user_export

    try:
        build_user_export.delay(task.id)
    except Exception:
        # Broker unavailable: leave the row pending so a later retry can enqueue
        # it; never fail the request over a queue blip (INV-002 spirit).
        logger.warning("export_enqueue_failed", export_task_id=task.id, exc_info=True)
    logger.info("data_export_requested", user_id=current_user.id, export_task_id=task.id)
    return ExportTaskResponse(task_id=task.id, status=task.status, created_at=task.created_at)


async def _owned_export_task(db: AsyncSession, user_id: str, task_id: str):
    from app.models.data_export import DataExportTask

    return (
        await db.execute(select(DataExportTask).where(DataExportTask.id == task_id, DataExportTask.user_id == user_id))
    ).scalar_one_or_none()


@router.get("/me/export/{task_id}", response_model=ExportStatusResponse)
@rate_limit("30/minute")
async def get_export_status(
    request: Request,
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export task status; mints a short-lived single-use download URL when ready."""
    task = await _owned_export_task(db, current_user.id, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="导出任务不存在")

    download_url = None
    if task.status == "ready" and task.file_path and task.downloaded_at is None:
        now = datetime.now(UTC)
        expires_at = _as_utc(task.download_expires_at)
        if task.download_token is None or expires_at is None or expires_at <= now:
            task.download_token = uuid.uuid4().hex
            task.download_expires_at = now + timedelta(seconds=EXPORT_URL_TTL_SECONDS)
            await commit_refresh(db, task)
        download_url = f"/api/v1/users/me/export/{task.id}/download?token={task.download_token}"

    return ExportStatusResponse(
        task_id=task.id,
        status=task.status,
        created_at=task.created_at,
        size_bytes=task.size_bytes,
        error=task.error,
        download_url=download_url,
        download_expires_at=task.download_expires_at if download_url else None,
    )


@router.get("/me/export/{task_id}/download")
@rate_limit("10/minute")
async def download_export(
    request: Request,
    task_id: str,
    token: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve the export ZIP once, consuming the token.

    The token is single-use and short-lived; a second request (or a stale token)
    is rejected with 410 so a leaked URL cannot be replayed.
    """
    task = await _owned_export_task(db, current_user.id, task_id)
    now = datetime.now(UTC)
    expires_at = _as_utc(task.download_expires_at) if task is not None else None
    if (
        task is None
        or task.status != "ready"
        or task.file_path is None
        or task.download_token is None
        or task.download_token != token
        or expires_at is None
        or expires_at <= now
        or task.downloaded_at is not None
    ):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="下载链接已失效，请重新获取")

    path = Path(get_settings().local_media_path) / task.file_path
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="导出文件不存在")

    task.downloaded_at = now
    await db.commit()
    return FileResponse(path, media_type="application/zip", filename=f"seeword-export-{task.id}.zip")
