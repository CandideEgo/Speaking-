"""Audio extraction from various video sources.

Supports:
- Streaming URLs (YouTube, Bilibili, etc.) via yt-dlp pipe → ffmpeg
- Douyin via Playwright direct extraction
- Local video files via ffmpeg
"""

import asyncio
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from app.core.config import get_settings
from .exceptions import AudioExtractionError

logger = logging.getLogger(__name__)

# Shared ffmpeg audio encoding flags for PCM 16kHz mono WAV
_FFMPEG_WAV_ARGS = ["-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1"]

# Windows no-window flag
_NO_WINDOW = 0
if hasattr(subprocess, "CREATE_NO_WINDOW"):
    _NO_WINDOW = subprocess.CREATE_NO_WINDOW


# Known video streaming hostnames that yt-dlp can handle
_VIDEO_HOSTS = {
    "youtube.com", "youtu.be", "youtube-nocookie.com",
    "twitter.com", "x.com", "fxwitter.com",
    "bilibili.com", "b23.tv",
    "douyin.com", "tiktok.com",
    "vimeo.com",
    "facebook.com", "fb.watch",
    "instagram.com",
    "reddit.com", "redd.it",
    "dailymotion.com",
    "twitch.tv",
    "soundcloud.com",
    "music.163.com",
    "qq.com",
    "sohu.com",
    "weibo.com",
    "xiaohongshu.com",
    "kuaishou.com",
    "ixigua.com",
    "zhihu.com",
}

# URL patterns for normalizing search/share/modal URLs to direct video URLs
_URL_NORMALIZERS = [
    # Douyin search page with modal_id -> direct video URL
    (re.compile(r"https?://(?:www\.)?douyin\.com/.*[?&]modal_id=(\d+).*"), r"https://www.douyin.com/video/\1"),
    # Douyin short share links
    (re.compile(r"https?://v\.douyin\.com/(\w+)"), None),
    # TikTok share links
    (re.compile(r"https?://(?:vm|vt|www)\.tiktok\.com/(\w+)"), None),
    # Bilibili: strip tracking params & normalize mobile/b23 to desktop
    (re.compile(r"https?://(?:m\.)?bilibili\.com/video/(BV\w+).*"), r"https://www.bilibili.com/video/\1/"),
    (re.compile(r"https?://b23\.tv/(\w+).*"), None),
    # Twitter/X mobile -> standard
    (re.compile(r"https?://mobile\.(?:twitter|x)\.com(/.+)"), r"https://x.com\1"),
]


def _get_ytdlp_path() -> str:
    """Get the yt-dlp executable path."""
    found = shutil.which("yt-dlp")
    if found:
        return found
    scripts = Path(sys.executable).parent
    for suffix in (".exe", ""):
        p = scripts / f"yt-dlp{suffix}"
        if p.exists():
            return str(p)
    return "yt-dlp"


def _get_ffmpeg_path() -> str:
    """Get the ffmpeg executable path."""
    found = shutil.which("ffmpeg")
    return found or "ffmpeg"


def _normalize_streaming_url(url: str) -> str:
    """Normalize streaming URLs to a format yt-dlp can extract from."""
    for pattern, replacement in _URL_NORMALIZERS:
        if replacement is None:
            continue
        new_url = pattern.sub(replacement, url)
        if new_url != url:
            logger.info(f"Normalized streaming URL: {url} -> {new_url}")
            return new_url
    return url


def _is_streaming_url(url: str) -> bool:
    """Check if the URL looks like a streaming video URL (yt-dlp supported)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    if host.startswith("m."):
        host = host[2:]
    return any(host.endswith(h) or host == h for h in _VIDEO_HOSTS)


def _build_ytdlp_extra_args() -> list[str]:
    """Build extra yt-dlp arguments from settings (cookies, proxy)."""
    extra = []
    settings = get_settings()
    if settings.http_proxy:
        extra.extend(["--proxy", settings.http_proxy])
    if settings.youtube_cookies_path and Path(settings.youtube_cookies_path).exists():
        extra.extend(["--cookies", settings.youtube_cookies_path])
    return extra


def extract_streaming_audio(url: str, output_path: str) -> None:
    """Extract audio from a streaming URL using yt-dlp pipe to ffmpeg.

    Args:
        url: Video URL (YouTube, Bilibili, etc.)
        output_path: Path to save the output WAV file

    Raises:
        AudioExtractionError: If extraction fails
    """
    url = _normalize_streaming_url(url)
    extra = _build_ytdlp_extra_args()

    ytdlp_cmd = [
        _get_ytdlp_path(),
        *extra,
        "-o", "-",
        "--no-playlist",
        "-f", "bestaudio/best",
        "--", url,
    ]

    ffmpeg_cmd = [
        _get_ffmpeg_path(), "-y", "-i", "pipe:0",
        *_FFMPEG_WAV_ARGS,
        output_path,
    ]

    logger.info(f"Extracting streaming audio: {url[:80]}...")

    try:
        proc = subprocess.Popen(
            ytdlp_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=_NO_WINDOW,
        )
        ffmpeg_proc = subprocess.run(
            ffmpeg_cmd,
            stdin=proc.stdout,
            capture_output=True,
            text=True,
            timeout=1800,
            creationflags=_NO_WINDOW,
        )
        _, ytdlp_stderr = proc.communicate()

        if ffmpeg_proc.returncode != 0 or proc.returncode != 0:
            stderr_msg = ytdlp_stderr.decode(errors="replace") if ytdlp_stderr else ""
            raise AudioExtractionError(
                f"ffmpeg streaming extraction failed.\n"
                f"ffmpeg stderr: {ffmpeg_proc.stderr[-500:]}\n"
                f"yt-dlp stderr: {stderr_msg[-1000:]}"
            )

        if not Path(output_path).exists():
            raise AudioExtractionError("Audio extraction succeeded but output file not found")

        logger.info(f"Audio extracted: {output_path} ({os.path.getsize(output_path)} bytes)")

    except subprocess.TimeoutExpired:
        raise AudioExtractionError("Audio extraction timed out (1800s)")
    except Exception as e:
        if not isinstance(e, AudioExtractionError):
            raise AudioExtractionError(f"Audio extraction failed: {e}") from e
        raise


def extract_local_audio(video_path: str, output_path: str) -> None:
    """Extract audio from a local video file using ffmpeg.

    Args:
        video_path: Path to the local video file
        output_path: Path to save the output WAV file

    Raises:
        AudioExtractionError: If extraction fails
    """
    cmd = [
        _get_ffmpeg_path(), "-y", "-i", video_path,
        *_FFMPEG_WAV_ARGS,
        output_path,
    ]

    logger.info(f"Extracting local audio: {video_path}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            creationflags=_NO_WINDOW,
        )
        if result.returncode != 0:
            raise AudioExtractionError(f"ffmpeg failed: {result.stderr[:500]}")

        if not Path(output_path).exists():
            raise AudioExtractionError("Audio extraction succeeded but output file not found")

        logger.info(f"Audio extracted: {output_path} ({os.path.getsize(output_path)} bytes)")

    except subprocess.TimeoutExpired:
        raise AudioExtractionError("Audio extraction timed out (300s)")
    except Exception as e:
        if not isinstance(e, AudioExtractionError):
            raise AudioExtractionError(f"Audio extraction failed: {e}") from e
        raise


def extract_douyin_audio(url: str, output_path: str) -> dict:
    """Extract audio from a Douyin video URL using advanced Playwright extraction.

    Uses the advanced Douyin extractor with stealth mode, API interception,
    and embedded JSON parsing for reliable metadata and audio extraction.

    Args:
        url: Douyin video URL
        output_path: Path to save the output WAV file

    Returns:
        dict: Rich metadata from Douyin (id, title, duration, thumbnail, etc.)

    Raises:
        AudioExtractionError: If extraction fails
    """
    from .douyin_extractor import extract_douyin_audio_advanced
    return extract_douyin_audio_advanced(url, output_path)


def get_video_duration(video_path: str) -> float:
    """Get video/audio duration in seconds using ffprobe.

    Args:
        video_path: Path to video or audio file

    Returns:
        Duration in seconds
    """
    ffprobe_path = shutil.which("ffprobe") or "ffprobe"
    cmd = [
        ffprobe_path, "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0
