"""Learning records API — list and detail endpoints for per-video learning progress."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import commit_refresh, get_db
from app.core.limiter import rate_limit
from app.models.learning import LearningRecord
from app.models.user import User
from app.models.video import Video
from app.schemas.community import VideoBrief
from app.schemas.learning import (
    LearningRecordListResponse,
    LearningRecordResponse,
    SaveProgressRequest,
    SaveProgressResponse,
)

router = APIRouter(prefix="/learning", tags=["learning"])


@router.get("/records", response_model=LearningRecordListResponse)
@rate_limit("30/minute")
async def list_learning_records(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    completed: bool | None = Query(None, description="Filter by completion status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's per-video learning records with video info."""
    offset = (page - 1) * page_size

    # Build query
    stmt = (
        select(LearningRecord, Video)
        .join(Video, LearningRecord.video_id == Video.id)
        .where(LearningRecord.user_id == current_user.id)
        .order_by(LearningRecord.last_accessed_at.desc().nullslast(), LearningRecord.created_at.desc())
    )

    if completed is not None:
        stmt = stmt.where(LearningRecord.completed == completed)

    # Total count
    count_stmt = select(func.count(LearningRecord.id)).where(LearningRecord.user_id == current_user.id)
    if completed is not None:
        count_stmt = count_stmt.where(LearningRecord.completed == completed)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Fetch records with video info
    result = await db.execute(stmt.offset(offset).limit(page_size))

    records = []
    for lr, video in result.all():
        video_info = VideoBrief.model_validate(video)
        record_resp = LearningRecordResponse(
            id=lr.id,
            video_id=lr.video_id,
            words_learned=lr.words_learned,
            speaking_attempts=lr.speaking_attempts,
            quiz_score=lr.quiz_score,
            completed=lr.completed,
            time_spent_seconds=lr.time_spent_seconds,
            last_accessed_at=lr.last_accessed_at,
            progress_percentage=lr.progress_percentage,
            position_seconds=lr.position_seconds,
            created_at=lr.created_at,
            video=video_info,
        )
        records.append(record_resp)

    return LearningRecordListResponse(
        records=records,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/records/{record_id}", response_model=LearningRecordResponse)
@rate_limit("30/minute")
async def get_learning_record(
    request: Request,
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single learning record detail."""
    result = await db.execute(
        select(LearningRecord).where(
            LearningRecord.id == record_id,
            LearningRecord.user_id == current_user.id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Learning record not found")

    # Fetch associated video
    video_result = await db.execute(select(Video).where(Video.id == record.video_id))
    video = video_result.scalar_one_or_none()

    video_info = None
    if video:
        video_info = VideoBrief.model_validate(video)

    return LearningRecordResponse(
        id=record.id,
        video_id=record.video_id,
        words_learned=record.words_learned,
        speaking_attempts=record.speaking_attempts,
        quiz_score=record.quiz_score,
        completed=record.completed,
        time_spent_seconds=record.time_spent_seconds,
        last_accessed_at=record.last_accessed_at,
        progress_percentage=record.progress_percentage,
        position_seconds=record.position_seconds,
        created_at=record.created_at,
        video=video_info,
    )


@router.patch("/progress", response_model=SaveProgressResponse)
@rate_limit("30/minute")
async def save_watch_progress(
    request: Request,
    body: SaveProgressRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save or update the user's watch progress for a video.

    Called periodically by the frontend (debounced) to persist the
    current playback position. Also updates progress_percentage
    based on position vs video duration.
    """
    # Find or create the learning record (lock to prevent duplicate creation)
    result = await db.execute(
        select(LearningRecord)
        .where(
            LearningRecord.user_id == current_user.id,
            LearningRecord.video_id == body.video_id,
        )
        .with_for_update()
    )
    record = result.scalar_one_or_none()

    if not record:
        record = LearningRecord(
            user_id=current_user.id,
            video_id=body.video_id,
            position_seconds=body.position_seconds,
            last_accessed_at=datetime.now(UTC),
        )
        db.add(record)
        try:
            await db.flush()
        except Exception as exc:
            await db.rollback()
            if "uq_learning_record_user_video" in str(exc):
                # Concurrent request created it — re-fetch
                result = await db.execute(
                    select(LearningRecord).where(
                        LearningRecord.user_id == current_user.id,
                        LearningRecord.video_id == body.video_id,
                    )
                )
                record = result.scalar_one_or_none()
                if not record:
                    raise
            else:
                raise
    else:
        record.position_seconds = body.position_seconds
        record.last_accessed_at = datetime.now(UTC)

    # Update progress_percentage based on position vs video duration
    video_result = await db.execute(select(Video).where(Video.id == body.video_id))
    video = video_result.scalar_one_or_none()
    if video and video.duration and video.duration > 0:
        record.progress_percentage = round(min(100, (body.position_seconds / video.duration) * 100), 1)

    await commit_refresh(db, record)

    return SaveProgressResponse(
        position_seconds=record.position_seconds or 0.0,
        progress_percentage=record.progress_percentage or 0.0,
    )


@router.get("/progress/{video_id}")
@rate_limit("30/minute")
async def get_watch_progress(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the user's watch progress for a specific video.

    Returns the saved playback position so the frontend can
    resume from where the user left off.
    """
    result = await db.execute(
        select(LearningRecord).where(
            LearningRecord.user_id == current_user.id,
            LearningRecord.video_id == video_id,
        )
    )
    record = result.scalar_one_or_none()

    return {
        "video_id": video_id,
        "position_seconds": record.position_seconds if record else None,
        "progress_percentage": record.progress_percentage if record else 0.0,
    }
