import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import commit_refresh
from app.models.user import User
from app.models.video import Video, VideoSource, VideoStatus
from app.schemas.video import VideoResponse

# The stored extension is derived SERVER-SIDE from the (whitelisted) content
# type — never from the client-supplied filename. The file is later served
# from /media with the stored extension, so a client-chosen extension (e.g.
# "x.html" with a spoofed "video/mp4" header) could plant executable content
# on the trusted origin (stored-XSS / account takeover via localStorage token
# theft). The content-type header itself is client-controlled too, so this
# mapping is the only thing we trust here; actual file bytes are validated as
# video later in the pipeline (ffprobe/transcode).
_CONTENT_TYPE_EXT = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
    "video/x-matroska": ".mkv",
}

_READ_CHUNK = 1024 * 1024  # 1 MB


async def handle_video_upload(
    file: UploadFile,
    title: str,
    current_user: User,
    db: AsyncSession,
) -> VideoResponse:
    """Handle a local video file upload, validate, save, and queue for processing."""
    settings = get_settings()

    # Validate + map the content type to a server-side extension.
    file_ext = _CONTENT_TYPE_EXT.get(file.content_type or "")
    if file_ext is None:
        allowed = ", ".join(sorted(_CONTENT_TYPE_EXT.values()))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {allowed}",
        )

    # Validate file size while reading — stream in chunks and stop as soon as
    # the cap is exceeded instead of buffering the whole upload into memory
    # (an oversized body would otherwise be a trivial memory-exhaustion vector).
    contents = bytearray()
    while True:
        chunk = await file.read(_READ_CHUNK)
        if not chunk:
            break
        contents.extend(chunk)
        if len(contents) > settings.max_upload_file_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"File too large: {len(contents) / 1024 / 1024:.1f}MB. "
                    f"Max: {settings.max_upload_file_size / 1024 / 1024:.0f}MB"
                ),
            )
    file_size = len(contents)

    # Save to temp storage
    temp_dir = Path(settings.upload_temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)
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
        auto_publish=False,
    )
    db.add(video)
    await commit_refresh(db, video)

    return VideoResponse.model_validate(video)
