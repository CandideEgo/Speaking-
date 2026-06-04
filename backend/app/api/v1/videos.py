import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.user import User
from app.models.video import Video, VideoStatus, Platform
from app.schemas.video import VideoCreate, VideoResponse, VideoDetailResponse, SubtitleResponse, VideoStatusResponse
from app.api.dependencies import get_current_user, get_optional_user, get_admin_user
from app.core.limiter import rate_limit

router = APIRouter(prefix="/videos", tags=["videos"])


def detect_platform(url: str) -> Platform:
    url_lower = url.lower()
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return Platform.youtube
    if "bilibili.com" in url_lower or "b23.tv" in url_lower:
        return Platform.bilibili
    return Platform.other


def extract_youtube_video_id(url: str) -> str | None:
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


@router.post("", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def submit_video(
    data: VideoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    platform = detect_platform(data.source_url)

    # Check if this URL was already processed
    result = await db.execute(
        select(Video).where(
            Video.source_url == data.source_url,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Create a new reference for this user
        user_video = Video(
            user_id=current_user.id,
            title=existing.title,
            source_url=data.source_url,
            platform=existing.platform,
            thumbnail_url=existing.thumbnail_url,
            duration=existing.duration,
            difficulty_level=existing.difficulty_level,
            video_url_480p=existing.video_url_480p,
            video_url_720p=existing.video_url_720p,
            video_url_1080p=existing.video_url_1080p,
            youtube_video_id=existing.youtube_video_id,
            processing_mode=existing.processing_mode,
            status=existing.status,
        )
        db.add(user_video)
        await db.commit()
        await db.refresh(user_video)
        return VideoResponse.model_validate(user_video)

    # New video — queue for processing
    youtube_video_id = extract_youtube_video_id(data.source_url) if platform == Platform.youtube else None
    video = Video(
        user_id=current_user.id,
        title="Processing...",
        source_url=data.source_url,
        platform=platform,
        youtube_video_id=youtube_video_id,
        status=VideoStatus.processing,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    # Dispatch to Celery — lightweight first for YouTube, full for others
    from app.tasks.video_processing import process_video, process_video_lightweight
    if platform == Platform.youtube:
        process_video_lightweight.delay(video.id)
    else:
        process_video.delay(video.id)

    return VideoResponse.model_validate(video)


@router.get("/public", response_model=list[VideoResponse])
async def list_public_videos(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video)
        .where(Video.is_official == True, Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]))
        .order_by(Video.created_at.desc())
        .limit(50)
    )
    videos = result.scalars().all()
    return [VideoResponse.model_validate(v) for v in videos]


@router.get("/{video_id}", response_model=VideoDetailResponse)
async def get_video(
    video_id: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video)
        .options(selectinload(Video.subtitles))
        .where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Official videos are public; user-owned videos require auth
    if not video.is_official and (current_user is None or video.user_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Create LearningRecord on first view for authenticated users
    if current_user:
        from app.models.learning import LearningRecord
        lr_result = await db.execute(
            select(LearningRecord).where(
                LearningRecord.user_id == current_user.id,
                LearningRecord.video_id == video_id,
            )
        )
        if not lr_result.scalar_one_or_none():
            db.add(LearningRecord(user_id=current_user.id, video_id=video_id))
            await db.commit()

    return VideoDetailResponse(
        id=video.id,
        title=video.title,
        source_url=video.source_url,
        platform=video.platform.value,
        thumbnail_url=video.thumbnail_url,
        duration=video.duration,
        difficulty_level=video.difficulty_level,
        status=video.status.value,
        topic_tags=video.topic_tags,
        is_official=video.is_official,
        video_url_480p=video.video_url_480p,
        video_url_720p=video.video_url_720p,
        video_url_1080p=video.video_url_1080p,
        youtube_video_id=video.youtube_video_id,
        processing_mode=video.processing_mode,
        created_at=video.created_at.isoformat(),
        subtitles=[
            SubtitleResponse(
                id=s.id,
                start_time=s.start_time,
                end_time=s.end_time,
                text_en=s.text_en,
                text_zh=s.text_zh,
                sentence_index=s.sentence_index,
                grammar_note=s.grammar_note,
            )
            for s in (video.subtitles or [])
        ],
    )


@router.get("/{video_id}/status", response_model=VideoStatusResponse)
async def get_video_status(
    video_id: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if not video.is_official and (current_user is None or video.user_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return VideoStatusResponse(status=video.status.value, video_url_720p=video.video_url_720p)


@router.get("/{video_id}/quiz")
async def get_video_quiz(
    video_id: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get quiz questions for a video. Returns empty list if quiz not yet generated."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if not video.is_official and (current_user is None or video.user_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return {
        "video_id": video.id,
        "quiz": video.quiz_data or [],
    }


@router.post("/{video_id}/quiz/submit")
async def submit_quiz_result(
    video_id: str,
    score: float = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit quiz score and update learning record."""
    # Verify video exists
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Upsert LearningRecord with quiz score
    from app.models.learning import LearningRecord
    lr_result = await db.execute(
        select(LearningRecord).where(
            LearningRecord.user_id == current_user.id,
            LearningRecord.video_id == video_id,
        )
    )
    record = lr_result.scalar_one_or_none()
    if record:
        record.quiz_score = score
        if score >= 60:
            record.completed = True
    else:
        record = LearningRecord(
            user_id=current_user.id,
            video_id=video_id,
            quiz_score=score,
            completed=score >= 60,
        )
        db.add(record)

    await db.commit()
    return {"success": True, "quiz_score": score}


@router.get("", response_model=list[VideoResponse])
async def list_videos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video)
        .where(Video.user_id == current_user.id)
        .order_by(Video.created_at.desc())
        .limit(50)
    )
    videos = result.scalars().all()
    return [VideoResponse.model_validate(v) for v in videos]


@router.post("/seed", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def seed_video(
    data: VideoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Seed an official video for the public homepage. Admin only."""
    platform = detect_platform(data.source_url)
    youtube_video_id = extract_youtube_video_id(data.source_url) if platform == Platform.youtube else None

    video = Video(
        title="Processing...",
        source_url=data.source_url,
        platform=platform,
        youtube_video_id=youtube_video_id,
        status=VideoStatus.processing,
        is_official=True,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    from app.tasks.video_processing import process_video, process_video_lightweight
    if platform == Platform.youtube:
        process_video_lightweight.delay(video.id)
    else:
        process_video.delay(video.id)

    return VideoResponse.model_validate(video)
