"""Audio extraction from various video sources.

Supports:
- Streaming URLs (YouTube, etc.) via yt-dlp pipe → ffmpeg (admin imports)
- Local video files via ffmpeg
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import structlog

from app.core.config import get_settings

from .exceptions import AudioExtractionError

logger = structlog.get_logger()

# Shared ffmpeg audio encoding flags for PCM 16kHz mono WAV
_FFMPEG_WAV_ARGS = ["-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1"]

# Windows no-window flag
_NO_WINDOW = 0
if hasattr(subprocess, "CREATE_NO_WINDOW"):
    _NO_WINDOW = subprocess.CREATE_NO_WINDOW


# Known video streaming hostnames that yt-dlp can handle
_VIDEO_HOSTS = {
    "youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "twitter.com",
    "x.com",
    "fxwitter.com",
    "bilibili.com",
    "b23.tv",
    "douyin.com",
    "tiktok.com",
    "vimeo.com",
    "facebook.com",
    "fb.watch",
    "instagram.com",
    "reddit.com",
    "redd.it",
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
            logger.info("Normalized streaming URL", original=url, normalized=new_url)
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
    """Extract audio from a streaming URL via yt-dlp → temp file → ffmpeg.

    Two-step download instead of a yt-dlp→ffmpeg pipe: yt-dlp sometimes keeps
    stdout open after the audio stream finishes (still fetching metadata /
    chapters / subtitles), which deadlocks the pipe — ffmpeg waits for EOF
    and hits its 1800s timeout (the historical "Audio extraction timed out"
    failure). Writing to a file lets yt-dlp exit on its own and gives the two
    steps independent timeouts.

    Args:
        url: Video URL (YouTube, Bilibili, etc.)
        output_path: Path to save the output WAV file

    Raises:
        AudioExtractionError: If extraction fails
    """
    url = _normalize_streaming_url(url)
    extra = _build_ytdlp_extra_args()

    # yt-dlp appends the real extension (.m4a/.webm/.opus); we glob it back.
    raw_pattern = f"{output_path}.src"

    ytdlp_cmd = [
        _get_ytdlp_path(),
        *extra,
        "-o",
        f"{raw_pattern}.%(ext)s",
        "--no-playlist",
        "-f",
        "bestaudio/best",
        "--no-write-info-json",
        "--no-write-thumbnail",
        "--no-write-subs",
        "--socket-timeout",
        "30",
        "--",
        url,
    ]

    logger.info("Extracting streaming audio", url=url[:80])

    raw_file: str | None = None
    try:
        # Step 1: yt-dlp downloads audio to a temp file (exits when done — no pipe)
        ytdlp_proc = subprocess.run(
            ytdlp_cmd,
            capture_output=True,
            timeout=600,
            creationflags=_NO_WINDOW,
        )
        if ytdlp_proc.returncode != 0:
            stderr = ytdlp_proc.stderr.decode(errors="replace") if ytdlp_proc.stderr else ""
            raise AudioExtractionError(f"yt-dlp audio download failed: {stderr[-1000:]}")

        # Locate the downloaded file (yt-dlp appended the extension)
        candidates = [
            p for p in Path(raw_pattern).parent.glob(Path(raw_pattern).name + ".*") if p.suffix.lower() != ".wav"
        ]
        if not candidates:
            raise AudioExtractionError("yt-dlp finished but produced no audio file")
        raw_file = str(candidates[0])

        # Step 2: ffmpeg converts to 16kHz mono WAV
        ffmpeg_cmd = [
            _get_ffmpeg_path(),
            "-y",
            "-i",
            raw_file,
            *_FFMPEG_WAV_ARGS,
            output_path,
        ]
        ffmpeg_proc = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            timeout=300,
            creationflags=_NO_WINDOW,
        )
        if ffmpeg_proc.returncode != 0:
            stderr = ffmpeg_proc.stderr.decode(errors="replace") if ffmpeg_proc.stderr else ""
            raise AudioExtractionError(f"ffmpeg conversion failed: {stderr[-500:]}")

        if not Path(output_path).exists():
            raise AudioExtractionError("Audio extraction succeeded but output file not found")

        logger.info("Audio extracted", path=output_path, size=os.path.getsize(output_path))

    except subprocess.TimeoutExpired as e:
        raise AudioExtractionError(f"Audio extraction timed out ({e.timeout}s)") from None
    except Exception as e:
        if not isinstance(e, AudioExtractionError):
            raise AudioExtractionError(f"Audio extraction failed: {e}") from e
        raise
    finally:
        if raw_file and Path(raw_file).exists():
            try:
                os.remove(raw_file)
            except OSError:
                pass


def extract_local_audio(video_path: str, output_path: str) -> None:
    """Extract audio from a local video file using ffmpeg.

    Args:
        video_path: Path to the local video file
        output_path: Path to save the output WAV file

    Raises:
        AudioExtractionError: If extraction fails
    """
    cmd = [
        _get_ffmpeg_path(),
        "-y",
        "-i",
        video_path,
        *_FFMPEG_WAV_ARGS,
        output_path,
    ]

    logger.info("Extracting local audio", path=video_path)

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

        logger.info("Audio extracted", path=output_path, size=os.path.getsize(output_path))

    except subprocess.TimeoutExpired:
        raise AudioExtractionError("Audio extraction timed out (300s)") from None
    except Exception as e:
        if not isinstance(e, AudioExtractionError):
            raise AudioExtractionError(f"Audio extraction failed: {e}") from e
        raise


def download_http_to_temp(url: str, temp_dir: Path) -> str:
    """Download a generic HTTP(S) URL (OSS / CDN / direct media) to a temp file.

    Used for non-streaming-host URLs where yt-dlp is not applicable — e.g. an
    OSS signed URL handed to a remote transcription worker. The caller is
    responsible for cleaning up the returned path.

    Args:
        url: HTTP(S) URL to download.
        temp_dir: Directory to write the temp file into.

    Returns:
        Path to the downloaded file.

    Raises:
        AudioExtractionError: If the download fails.
    """
    import httpx

    settings = get_settings()
    ext = Path(urlparse(url).path).suffix or ".mp4"
    out = temp_dir / f"dl_{abs(hash(url))}{ext}"
    proxy = settings.http_proxy or None

    logger.info("Downloading media URL", url=url[:80], dest=str(out))
    try:
        with httpx.Client(timeout=600.0, proxies=proxy) as client:
            with client.stream("GET", url) as resp:
                resp.raise_for_status()
                with open(out, "wb") as f:
                    for chunk in resp.iter_bytes():
                        f.write(chunk)
        return str(out)
    except Exception as e:
        raise AudioExtractionError(f"Failed to download {url[:80]}: {e}") from e


def get_video_duration(video_path: str) -> float:
    """Get video/audio duration in seconds using ffprobe.

    Args:
        video_path: Path to video or audio file

    Returns:
        Duration in seconds
    """
    ffprobe_path = shutil.which("ffprobe") or "ffprobe"
    cmd = [
        ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0
