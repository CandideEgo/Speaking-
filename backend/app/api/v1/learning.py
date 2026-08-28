"""Learning records API — list and detail endpoints for per-video learning progress."""

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import commit_refresh, get_db
from app.core.limiter import rate_limit
from app.models.learning import LearningRecord
from app.models.learning_plan import LearningEvent
from app.models.user import User
from app.models.video import Video
from app.schemas.common import VideoBrief
from app.schemas.learning import (
    LearningRecordResponse,
    SaveProgressRequest,
    SaveProgressResponse,
)
from app.schemas.pagination import PaginatedResponse, paginated

router = APIRouter(prefix="/learning", tags=["learning"])


@router.get("/records", response_model=PaginatedResponse[LearningRecordResponse])
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

    return paginated(records, page=page, page_size=page_size, total=total)


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
            async with db.begin_nested():
                await db.flush()
        except Exception as exc:
            if "uq_learning_record_user_video" in str(exc):
                # Concurrent request created it — re-fetch (outer txn still valid)
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


# ──────────────────────────────────────────────────────────────────────
# Phase 1 B0 — profile stats (D5 激励体系)
# ──────────────────────────────────────────────────────────────────────


def _week_bounds(now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    """Return (this_week_start, last_week_start, last_week_end) using ISO week.

    Week starts Monday 00:00 in the user's local UTC time (server-side
    approximation; full TZ is a future enhancement).
    """
    now = now or datetime.now(UTC)
    # Monday of this week
    start_of_today = datetime(now.year, now.month, now.day, tzinfo=UTC)
    this_monday = start_of_today - timedelta(days=start_of_today.weekday())
    last_monday = this_monday - timedelta(days=7)
    return this_monday, last_monday, this_monday


@router.get("/stats/weekly")
@rate_limit("30/minute")
async def stats_weekly(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated weekly activity for the profile 学习进度 page.

    - this_week_minutes: total watched minutes (LearningRecord.time_spent_seconds)
    - last_week_minutes: same for the prior Monday–Sunday window
    - week_delta_pct: 0.0 when last week is 0 (handle "first week" UI)
    - this_week_words/videos: counted from LearningEvent (learned_words /
      completed_video) so they reflect this calendar week
    - daily_minutes: 7-element list, Mon→Sun, 0 when no activity
    """
    now = datetime.now(UTC)
    this_monday, last_monday, _ = _week_bounds(now)

    async def _minutes_since(start: datetime, end: datetime) -> int:
        result = await db.execute(
            select(func.coalesce(func.sum(LearningRecord.time_spent_seconds), 0)).where(
                LearningRecord.user_id == current_user.id,
                LearningRecord.last_accessed_at >= start,
                LearningRecord.last_accessed_at < end,
            )
        )
        return result.scalars().one() // 60

    this_week_minutes = await _minutes_since(this_monday, now)
    last_week_minutes = await _minutes_since(last_monday, this_monday)

    if last_week_minutes > 0:
        week_delta_pct = round((this_week_minutes - last_week_minutes) / last_week_minutes * 100, 1)
    else:
        week_delta_pct = None  # "first week" → UI shows no arrow

    async def _event_count(event_type: str, start: datetime) -> int:
        result = await db.execute(
            select(func.coalesce(func.sum(LearningEvent.event_value), 0)).where(
                LearningEvent.user_id == current_user.id,
                LearningEvent.event_type == event_type,
                LearningEvent.event_date >= start.date(),
            )
        )
        return result.scalars().one()

    this_week_words = await _event_count("learned_words", this_monday)
    this_week_videos = await _event_count("completed_video", this_monday)

    # Daily minutes for the 7 days of this week, Mon→Sun.
    daily_minutes: list[dict] = []
    rows = (
        await db.execute(
            select(
                func.date(LearningRecord.last_accessed_at).label("d"),
                func.coalesce(func.sum(LearningRecord.time_spent_seconds), 0).label("s"),
            )
            .where(
                LearningRecord.user_id == current_user.id,
                LearningRecord.last_accessed_at >= this_monday,
            )
            .group_by(func.date(LearningRecord.last_accessed_at))
        )
    ).all()
    by_day = {str(r.d): int(r.s) // 60 for r in rows}
    for i in range(7):
        d = (this_monday + timedelta(days=i)).date().isoformat()
        daily_minutes.append({"date": d, "minutes": by_day.get(d, 0)})

    return {
        "this_week_minutes": this_week_minutes,
        "last_week_minutes": last_week_minutes,
        "week_delta_pct": week_delta_pct,
        "this_week_words": this_week_words,
        "this_week_videos": this_week_videos,
        "daily_minutes": daily_minutes,
    }


@router.get("/stats/event-distribution")
@rate_limit("30/minute")
async def stats_event_distribution(
    request: Request,
    days: int = Query(30, ge=1, le=180),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sum of LearningEvent.event_value grouped by event_type over the last N days.

    Used by the profile EventDistributionChart (D5). The frontend maps
    event_type → Chinese label and color.
    """
    cutoff = (datetime.now(UTC) - timedelta(days=days)).date()
    rows = (
        await db.execute(
            select(
                LearningEvent.event_type,
                func.coalesce(func.sum(LearningEvent.event_value), 0).label("total"),
            )
            .where(
                LearningEvent.user_id == current_user.id,
                LearningEvent.event_date >= cutoff,
            )
            .group_by(LearningEvent.event_type)
        )
    ).all()
    return [{"event_type": r.event_type, "count": int(r.total)} for r in rows]


@router.get("/stats/heatmap")
@rate_limit("30/minute")
async def stats_heatmap(
    request: Request,
    days: int = Query(90, ge=30, le=180),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily activity count for the last N days, zero-filled for missing days.

    `count` is the number of distinct LearningEvent rows for that date; the
    frontend's HeatmapCalendar bins it into 4 intensity tiers.
    """
    cutoff = (datetime.now(UTC) - timedelta(days=days)).date()
    rows = (
        await db.execute(
            select(
                LearningEvent.event_date,
                func.count(LearningEvent.id).label("n"),
            )
            .where(
                LearningEvent.user_id == current_user.id,
                LearningEvent.event_date >= cutoff,
            )
            .group_by(LearningEvent.event_date)
        )
    ).all()
    by_day: dict[str, int] = {str(r.event_date): int(r.n) for r in rows}
    today = date.today()
    out: list[dict] = []
    for i in range(days):
        d = (today - timedelta(days=days - 1 - i)).isoformat()
        n = by_day.get(d, 0)
        out.append({"date": d, "count": n, "active": n > 0})
    return out
