import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import commit_refresh
from app.models.user import User
from app.models.video import Video, VideoSource, VideoStatus
from app.schemas.video import VideoResponse


async def handle_video_upload(
    file: UploadFile,
    title: str,
    current_user: User,
    db: AsyncSession,
) -> VideoResponse:
    """Handle a local video file upload, validate, save, and queue for processing."""
    settings = get_settings()

    # Validate file type
    allowed_types = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. Allowed: mp4, webm, mov, avi, mkv",
        )

    # Validate file size
    contents = await file.read()
    file_size = len(contents)
    if file_size > settings.max_upload_file_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large: {file_size / 1024 / 1024:.1f}MB. Max: {settings.max_upload_file_size / 1024 / 1024:.0f}MB",
        )

    # Save to temp storage
    temp_dir = Path(settings.upload_temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)
    file_ext = Path(file.filename or "video.mp4").suffix or ".mp4"
    temp_path = temp_dir / f"{uuid.uuid4()}{file_ext}"

    with open(temp_path, "wb") as f:
        f.write(contents)

    # Create Video record — wait for admin to trigger processing
    video = Video(
        user_id=current_user.id,
        title=title or file.filename or "Uploaded Video",
        source_url=str(temp_path),
        video_source=VideoSource.local,
        status=VideoStatus.pending_processing,
        auto_publish=True,
    )
    db.add(video)
    await commit_refresh(db, video)

    return VideoResponse.model_validate(video)
