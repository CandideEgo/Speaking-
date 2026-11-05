"""Playback eligibility and local-media outcomes shared by tasks and publishing."""

import re
from datetime import UTC, datetime
from urllib.parse import urlsplit

from app.core.errors import BadRequestError
from app.models.video import Video, VideoSource, VideoStatus
from app.services.video_media import is_usable_local_url

RENDITION_FIELDS = {"480p": "video_url_480p", "720p": "video_url_720p", "1080p": "video_url_1080p"}
_YOUTUBE_ID = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])"
)


class PlaybackUnavailableError(RuntimeError):
    pass


def can_embed(video: Video) -> bool:
    """Match the current user's YouTube player fallback, never all imports."""
    if video.video_source != VideoSource.imported or video.storage_mode == "offline":
        return False
    try:
        parsed = urlsplit(video.source_url)
    except ValueError:
        return False
    host = (parsed.hostname or "").lower()
    allowed = any(host == suffix or host.endswith("." + suffix) for suffix in ("youtube.com", "youtu.be"))
    return parsed.scheme in ("http", "https") and allowed and _YOUTUBE_ID.search(video.source_url) is not None


def set_renditions(video: Video, urls: dict[str, str]) -> None:
    for label, field in RENDITION_FIELDS.items():
        setattr(video, field, urls.get(label))


async def accept_local_renditions(video: Video, urls: dict[str, str]) -> bool:
    verified = {
        label: url for label, url in urls.items() if label in RENDITION_FIELDS and await is_usable_local_url(url)
    }
    if not verified:
        return False
    set_renditions(video, verified)
    clear_localization_failure(video)
    return True


async def has_renditions(video: Video) -> bool:
    """Drop broken local pointers; a configured remote rendition is not fetched.

    Remote availability still needs deployment/CDN evidence. Offline material
    can never be made ready merely because its files or original link remain.
    """
    if video.storage_mode == "offline":
        return False
    found = False
    for field in RENDITION_FIELDS.values():
        url = getattr(video, field)
        if not url:
            continue
        try:
            parsed = urlsplit(url)
        except ValueError:
            setattr(video, field, None)
            continue
        usable = bool(parsed.hostname) if parsed.scheme in ("http", "https") else await is_usable_local_url(url)
        if usable:
            found = True
        else:
            setattr(video, field, None)
    return found


async def has_playback(video: Video) -> bool:
    return await has_renditions(video) or can_embed(video)


async def require_playback(video: Video) -> None:
    if not await has_playback(video):
        raise PlaybackUnavailableError("Video has no verified local rendition or supported playback source")


async def require_publishable(video: Video) -> None:
    if video.status != VideoStatus.ready:
        raise BadRequestError("只能发布 status=ready 的视频")
    try:
        await require_playback(video)
    except PlaybackUnavailableError as exc:
        raise BadRequestError("视频没有可用的播放文件或受支持的嵌入来源，暂不能发布") from exc


def record_localization_failure(video: Video, reason: str) -> None:
    video.download_failed_at = datetime.now(UTC)
    video.download_fail_count = (video.download_fail_count or 0) + 1
    video.error_message = reason


def clear_localization_failure(video: Video) -> None:
    video.download_failed_at = None
    video.download_fail_count = 0
    video.error_message = None
