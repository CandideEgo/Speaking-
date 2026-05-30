from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.user import User
from app.models.video import Video, VideoStatus, Platform
from app.schemas.video import VideoCreate, VideoResponse, VideoDetailResponse, SubtitleResponse
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/videos", tags=["videos"])


def detect_platform(url: str) -> Platform:
    url_lower = url.lower()
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return Platform.youtube
    if "bilibili.com" in url_lower or "b23.tv" in url_lower:
        return Platform.bilibili
    return Platform.other


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
            Video.status == VideoStatus.ready,
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
            status=VideoStatus.ready,
        )
        db.add(user_video)
        await db.commit()
        await db.refresh(user_video)
        return VideoResponse.model_validate(user_video)

    # New video — queue for processing
    video = Video(
        user_id=current_user.id,
        title="Processing...",
        source_url=data.source_url,
        platform=platform,
        status=VideoStatus.processing,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    # Dispatch to Celery for processing
    from app.tasks.video_processing import process_video
    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


@router.get("/{video_id}", response_model=VideoDetailResponse)
async def get_video(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video)
        .options(selectinload(Video.subtitles))
        .where(Video.id == video_id, Video.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Eager load subtitles via the relationship
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
