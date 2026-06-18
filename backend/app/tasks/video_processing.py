import tempfile
import subprocess
import json
import asyncio
from pathlib import Path

import structlog

from app.tasks.celery_app import celery_app
from app.tasks.async_helpers import run_async
from app.services.ai_service import get_ai_service
from app.utils.platform_utils import extract_youtube_video_id

logger = structlog.get_logger()

# Resolutions to transcode
TRANSCODE_PROFILES = {
    '480p': {'height': 480, 'bitrate': '800k'},
    '720p': {'height': 720, 'bitrate': '1500k'},
    '1080p': {'height': 1080, 'bitrate': '3000k'},
}


async def _translate_subtitles(texts: list[str]) -> list[str | None]:
    """Translate subtitle texts in batches. Each batch is a separate LLM call for reliability."""
    from app.services.translation import get_translation_service
    service = get_translation_service()
    results: list[str | None] = [None] * len(texts)

    batch_size = service.batch_size
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        translations = await service.translate_batch(batch)
        for j, t in enumerate(translations):
            results[i + j] = t

    return results


async def _identify_speakers(video_id: str, subs: list[dict]) -> None:
    """Identify speakers for each subtitle segment and update database."""
    from sqlalchemy import select
    from app.core.database import async_session
    from app.models.subtitle import Subtitle

    ai = get_ai_service()
    speakers = await ai.identify_speakers(subs)

    async with async_session() as db:
        # Batch-fetch all subtitles for this video in one query
        result = await db.execute(
            select(Subtitle)
            .where(Subtitle.video_id == video_id)
            .order_by(Subtitle.sentence_index)
        )
        sub_rows = {sub.sentence_index: sub for sub in result.scalars().all()}

        for i, speaker in enumerate(speakers):
            sub_row = sub_rows.get(i)
            if sub_row:
                sub_row.speaker = speaker
        await db.commit()

    logger.info("Identified speakers for video", video_id=video_id, identified=len([s for s in speakers if s]), total=len(speakers))


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=120, max_retries=3, time_limit=3600, soft_time_limit=3300)
def process_video(self, video_id: str):
    """Unified pipeline for ALL platforms: download, transcode, subtitles, translate.

    YouTube videos are now downloaded and transcoded locally just like
    Bilibili/Douyin/etc. — no more IFrame embed playback.
    """
    from sqlalchemy import select, delete
    from app.core.database import async_session
    from app.models.video import Video, VideoStatus, Platform
    from app.models.subtitle import Subtitle

    async def _process():
        async with async_session() as db:
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()
            if not video:
                logger.error("Video not found", video_id=video_id)
                return

            try:
                skip_ai = video.status == VideoStatus.ready_subtitles and video.subtitles

                if not skip_ai:
                    # --- Step: Extracting metadata ---
                    video.processing_step = "extracting"
                    await db.commit()

                    info = await _extract_video_info(video.source_url, video.platform)
                    if info:
                        video.title = info.get('title', video.title)
                        video.thumbnail_url = info.get('thumbnail')
                        video.duration = info.get('duration')
                        video.youtube_video_id = video.youtube_video_id or info.get('youtube_video_id')

                    # --- Step: Transcribing audio ---
                    video.processing_step = "transcribing"
                    await db.commit()

                    subs = await _extract_subtitles(video.source_url, video.platform)
                    if not subs:
                        video.status = VideoStatus.error
                        video.error_message = "Transcription failed. Could not extract audio or recognize speech."
                        video.processing_step = None
                        await db.commit()
                        return

                    texts = [s["text"] for s in subs]

                    # Step: save English subtitles immediately → ready_subtitles
                    for i, sub in enumerate(subs):
                        db.add(Subtitle(
                            video_id=video.id,
                            start_time=sub["start"],
                            end_time=sub["end"],
                            text_en=sub["text"],
                            sentence_index=i,
                        ))
                    video.status = VideoStatus.ready_subtitles
                    await db.commit()

                    # --- Step: Re-split by speakers (superior to plain identification) ---
                    video.processing_step = "splitting"
                    await db.commit()

                    logger.info("Re-splitting subtitles by speakers", video_id=video_id)
                    ai = get_ai_service()
                    split_subs = await ai.split_by_speakers(subs)
                    if len(split_subs) != len(subs):
                        logger.info("Re-split subtitles", video_id=video_id, original_count=len(subs), new_count=len(split_subs))
                        await db.execute(delete(Subtitle).where(Subtitle.video_id == video.id))
                        await db.commit()
                        for i, sub in enumerate(split_subs):
                            db.add(Subtitle(
                                video_id=video.id,
                                start_time=sub["start"],
                                end_time=sub["end"],
                                text_en=sub["text"],
                                sentence_index=i,
                                speaker=sub.get("speaker"),
                            ))
                        await db.commit()
                        subs = split_subs
                    else:
                        logger.info("No re-split needed", video_id=video_id)

                    # --- Step: Translating subtitles ---
                    video.processing_step = "translating"
                    await db.commit()

                    texts = [s["text"] for s in subs]
                    translated = await _translate_subtitles(texts)
                    # Batch-fetch all subtitles for this video in one query
                    result_all = await db.execute(
                        select(Subtitle)
                        .where(Subtitle.video_id == video.id)
                        .order_by(Subtitle.sentence_index)
                    )
                    sub_map = {sub.sentence_index: sub for sub in result_all.scalars().all()}
                    for i, t in enumerate(translated):
                        if t:
                            sub_row = sub_map.get(i)
                            if sub_row:
                                sub_row.text_zh = t

                # --- Step: Download + transcode (ALL platforms except local uploads) ---
                if video.platform == Platform.local:
                    # File already exists at source_url
                    video_path = video.source_url
                else:
                    video.processing_step = "downloading"
                    await db.commit()
                    video_path = await _download_video(video.source_url, video.id)

                if video_path:
                    video.processing_step = "transcoding"
                    await db.commit()
                    urls = await _transcode_video(video_path, video.id)
                    video.video_url_480p = urls.get('480p')
                    video.video_url_720p = urls.get('720p', f"/media/{video.id}.mp4")
                    video.video_url_1080p = urls.get('1080p')

                    # --- Step: Upload to OSS CDN (if configured) ---
                    from app.core.config import get_settings as _get_settings
                    _oss_settings = _get_settings()
                    if _oss_settings.oss_upload_enabled:
                        video.processing_step = "uploading"
                        await db.commit()
                        urls = await _upload_transcoded_to_oss(urls, video.id)
                        video.video_url_480p = urls.get('480p', video.video_url_480p)
                        video.video_url_720p = urls.get('720p', video.video_url_720p)
                        video.video_url_1080p = urls.get('1080p', video.video_url_1080p)

                        # Optionally clean up local transcoded files
                        if _oss_settings.oss_cleanup_local:
                            _cleanup_local_transcoded(video.id, urls)

                    # Clean up raw file to save disk space
                    raw_path = Path(video_path)
                    if raw_path.exists() and "_raw" in raw_path.name:
                        raw_path.unlink()
                        logger.info("Cleaned up raw video file", path=str(raw_path))

                video.processing_step = None
                video.status = VideoStatus.ready
                await db.commit()
                logger.info("Video processed", video_id=video_id)

                # Create notification for the video owner
                if video.user_id:
                    try:
                        from app.services.notification_service import create_notification
                        await create_notification(
                            user_id=video.user_id,
                            type="video_ready",
                            title="视频处理完成",
                            message=f'"{video.title}" 已准备好，开始学习吧！',
                            db=db,
                            related_url=f"/watch/{video.id}",
                        )
                        await db.commit()
                        logger.info("Created video_ready notification", video_id=video_id, user_id=video.user_id)
                    except Exception:
                        logger.exception("Failed to create video_ready notification", video_id=video_id)

            except Exception as e:
                logger.exception("Video processing failed", video_id=video_id)
                video.status = VideoStatus.error
                video.error_message = str(e)
                video.processing_step = None
                await db.commit()
                raise self.retry(exc=e)

    run_async(_process())


async def _extract_video_info(url: str, platform=None) -> dict | None:
    """Extract video metadata (title, thumbnail, duration) via yt-dlp or Playwright."""
    from app.models.video import Platform

    # For Douyin, use the advanced Playwright extractor for richer metadata
    if platform == Platform.douyin:
        try:
            from app.services.transcription.douyin_extractor import fetch_douyin_video_data
            data = fetch_douyin_video_data(url)
            return {
                "title": data.get("title", ""),
                "thumbnail": data.get("thumbnail", ""),
                "duration": data.get("duration", 0),
                "youtube_video_id": None,
            }
        except Exception:
            logger.exception("Douyin metadata extraction failed, falling back to yt-dlp")
            # Fall through to yt-dlp

    import yt_dlp
    from app.core.config import get_settings

    settings = get_settings()
    loop = asyncio.get_running_loop()

    def _sync_extract():
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
        }
        if settings.http_proxy:
            opts["proxy"] = settings.http_proxy
        if settings.youtube_cookies_path:
            opts["cookiefile"] = settings.youtube_cookies_path
        opts["remote_components"] = "ejs:github"
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return {
                    "title": info.get("title"),
                    "thumbnail": info.get("thumbnail"),
                    "duration": info.get("duration"),
                    "youtube_video_id": info.get("id"),
                }
        except Exception:
            logger.exception("Failed to extract video info")
            return None

    return await loop.run_in_executor(None, _sync_extract)


async def _download_video(url: str, video_id: str) -> str | None:
    """Download video from YouTube/Bilibili to local media storage.

    Returns the file path if successful, None otherwise.
    """
    import yt_dlp
    from app.core.config import get_settings

    settings = get_settings()
    media_dir = Path(settings.local_media_path).resolve()
    media_dir.mkdir(parents=True, exist_ok=True)
    output = str(media_dir / f"{video_id}_raw.%(ext)s")

    loop = asyncio.get_running_loop()

    def _sync_download():
        opts = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
            "outtmpl": output,
            "merge_output_format": "mp4",
        }
        if settings.http_proxy:
            opts["proxy"] = settings.http_proxy
        if settings.youtube_cookies_path:
            opts["cookiefile"] = settings.youtube_cookies_path
        opts["remote_components"] = "ejs:github"
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])

            raw_mp4 = media_dir / f"{video_id}_raw.mp4"
            if raw_mp4.exists():
                return str(raw_mp4)

            # yt-dlp may have used a different extension
            for f in media_dir.iterdir():
                if f.stem == f"{video_id}_raw" and f.suffix != ".mp4":
                    # Try renaming to mp4 if it's a supported format
                    return str(f)
            return None
        except Exception:
            logger.exception("Video download failed")
            return None

    return await loop.run_in_executor(None, _sync_download)


async def _transcode_video(source_path: str, video_id: str) -> dict[str, str]:
    """Transcode video to multiple resolutions using FFmpeg.

    Generates 480p, 720p, and 1080p variants stored alongside the raw file.
    Returns a dict mapping resolution key to URL path.
    """
    from app.core.config import get_settings

    settings = get_settings()
    media_dir = Path(settings.local_media_path).resolve()
    source = Path(source_path)

    if not source.exists():
        logger.error("Source video not found for transcoding", source_path=source_path)
        return {}

    urls: dict[str, str] = {}
    source_res = await _get_video_height(source_path)

    for label, profile in TRANSCODE_PROFILES.items():
        # Skip if source is already lower res than target
        if source_res and source_res < profile['height']:
            logger.info("Skipping transcoding, source resolution too low", label=label, source_res=source_res)
            continue

        out_name = f"{video_id}_{label}.mp4"
        out_path = media_dir / out_name

        cmd = [
            "ffmpeg", "-y",
            "-i", str(source),
            "-vf", f"scale=-2:{profile['height']}",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-b:v", profile['bitrate'],
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            str(out_path),
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()

            if proc.returncode == 0 and out_path.exists():
                urls[label] = f"/media/{out_name}"
                logger.info("Transcoded video", label=label, output=out_name)
            else:
                logger.error("FFmpeg transcoding failed", label=label, stderr=stderr.decode()[:200])
        except FileNotFoundError:
            logger.warning("FFmpeg not installed, skipping video transcoding")
            return {}
        except Exception:
            logger.exception("Transcoding failed", label=label)

    return urls


async def _upload_transcoded_to_oss(
    local_urls: dict[str, str], video_id: str
) -> dict[str, str]:
    """Upload transcoded video files to Alibaba Cloud OSS.

    Takes the dict of {label: local_path} returned by _transcode_video,
    uploads each file to OSS, and returns a new dict with CDN URLs for
    successful uploads. Failed uploads are omitted from the returned dict
    so the caller can fall back to the original local path.
    """
    from app.services.oss_service import upload_file

    cdn_urls: dict[str, str] = {}
    for label, local_path in local_urls.items():
        if not local_path or local_path.startswith("http"):
            # Already a URL or empty — skip
            cdn_urls[label] = local_path
            continue

        # local_path is like "/media/{video_id}_{label}.mp4"
        # Derive the actual filesystem path and the OSS object key
        from app.core.config import get_settings
        settings = get_settings()
        media_dir = Path(settings.local_media_path).resolve()
        filename = local_path.lstrip("/").replace("media/", "", 1)
        fs_path = media_dir / filename

        if not fs_path.exists():
            logger.warning(
                "OSS upload: transcoded file not found, skipping",
                label=label,
                fs_path=str(fs_path),
            )
            continue

        remote_key = filename  # e.g. "{video_id}_720p.mp4"
        cdn_url = await upload_file(str(fs_path), remote_key)

        if cdn_url:
            cdn_urls[label] = cdn_url
        else:
            logger.warning(
                "OSS upload failed, keeping local path",
                label=label,
                local_path=local_path,
            )

    return cdn_urls


def _cleanup_local_transcoded(video_id: str, cdn_urls: dict[str, str]) -> None:
    """Delete local transcoded files that were successfully uploaded to OSS.

    Only removes files whose CDN URL is present (i.e. upload succeeded).
    """
    from app.core.config import get_settings

    settings = get_settings()
    media_dir = Path(settings.local_media_path).resolve()

    for label in TRANSCODE_PROFILES:
        filename = f"{video_id}_{label}.mp4"
        local_file = media_dir / filename
        if local_file.exists() and label in cdn_urls and cdn_urls[label].startswith("http"):
            try:
                local_file.unlink()
                logger.info("Cleaned up local transcoded file after OSS upload", path=str(local_file))
            except Exception:
                logger.exception("Failed to clean up local transcoded file", path=str(local_file))


async def _get_video_height(path: str) -> int | None:
    """Get video height using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-select_streams", "v:0",
        "-show_entries", "stream=height",
        "-of", "csv=p=0",
        path,
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        height = stdout.decode().strip()
        return int(height) if height.isdigit() else None
    except Exception:
        return None


async def _extract_subtitles(url: str, platform=None) -> list[dict]:
    """Extract subtitles from video using audio transcription via Whisper.

    Unified transcription pipeline: downloads/extracts audio from the video,
    then transcribes it with faster-whisper. Supports YouTube, Bilibili,
    Douyin, and local files.

    Args:
        url: Video URL or local file path.
        platform: Platform enum to determine extraction strategy.

    Returns:
        list[dict]: [{start, end, text}] subtitle segments.
    """
    from app.services.transcription import TranscriptionService
    from app.models.video import Platform

    if platform is None:
        platform = Platform.other

    service = TranscriptionService()
    try:
        subs = await service.transcribe(url, platform)
        return subs
    except Exception as e:
        logger.exception("Transcription failed", url=url)
        return []


def _parse_json3(path: Path) -> list[dict]:
    """Parse YouTube JSON3 subtitle format into {start, end, text} dicts.

    JSON3 has clean word-level timing — each event contains only NEW words,
    not the accumulated text like VTT. This eliminates all overlap/dedup issues.
    """
    import json

    content = path.read_text(encoding="utf-8")
    data = json.loads(content)

    results = []
    for ev in data.get("events", []):
        if "segs" not in ev or ev.get("aAppend"):
            continue
        words = [s["utf8"] for s in ev["segs"] if "utf8" in s]
        if not words:
            continue
        text = " ".join(w.strip() for w in words).strip()
        if text:
            results.append({
                "start": ev["tStartMs"] / 1000,
                "end": (ev["tStartMs"] + ev["dDurationMs"]) / 1000,
                "text": text,
            })
    return results


def _parse_subtitle_file(path: Path) -> list[dict]:
    """Parse a VTT or SRT subtitle file into structured data."""
    content = path.read_text(encoding="utf-8")
    ext = path.suffix.lower()
    if ext == ".vtt":
        return _parse_webvtt(content)
    return _parse_srt(content)


def _parse_webvtt(content: str) -> list[dict]:
    """Parse WebVTT into {start, end, text} dicts, handling YouTube's rolling captions.

    YouTube auto-captions build up text cumulatively:
      "Hello, I'm" → "Hello, I'm here to" → "Hello, I'm here to talk about"
    with tiny 0.01s "summary" flashes between building segments.
    We group consecutive cumulative segments, take only the final complete one,
    then strip any overlapping text from the previous group at sentence boundaries.
    """
    import re

    content = re.sub(r"^WEBVTT.*\n", "", content)

    pattern = re.compile(
        r"(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})[^\n]*\n"
        r"((?:.+\n?)+?)(?=\n\n|\n?\d+\n|\Z)",
        re.MULTILINE,
    )

    raw = []
    for m in pattern.finditer(content):
        start = _ts_to_seconds(m.group(1))
        end = _ts_to_seconds(m.group(2))
        text = m.group(3).strip()

        # Strip word-level timing tags: <00:00:00.400><c>word</c>
        text = re.sub(r"<\d{2}:\d{2}:\d{2}[.,]\d{3}>", "", text)
        text = re.sub(r"</?c>", "", text)
        text = re.sub(r"\s{2,}", " ", text)

        if not text:
            continue

        # Skip sub-0.3s "summary" flashes
        if end - start < 0.3:
            continue

        raw.append({"start": start, "end": end, "text": text})

    if not raw:
        return []

    # Step 1: Group cumulative segments (each builds on the previous)
    groups = []
    current = [raw[0]]
    for seg in raw[1:]:
        # If this segment's text contains the previous segment's text, it's cumulative
        if current[-1]["text"] in seg["text"]:
            current.append(seg)
        else:
            groups.append(current)
            current = [seg]
    groups.append(current)

    # Step 2: Extract final (most complete) segment from each group
    complete = []
    for group in groups:
        final = group[-1]
        complete.append({
            "start": group[0]["start"],
            "end": group[-1]["end"],
            "text": final["text"],
        })

    # Step 3: Strip overlapping text between consecutive groups.
    # YouTube captions roll forward: group N ends with "X Y Z", group N+1 starts with "Y Z A".
    # We need to find the longest suffix of prev that matches a prefix of current text.
    SENTENCE_BOUNDARY = re.compile(r'[.?!]["\']?\s|[.?!]["\']?$')
    results = []
    prev = ""
    for seg in complete:
        text = seg["text"]
        if text == prev or text in prev:
            continue

        # Find longest suffix of prev matching prefix of text
        max_overlap = 0
        for i in range(1, min(len(prev), len(text)) + 1):
            if prev[-i:] == text[:i]:
                max_overlap = i

        if max_overlap >= 3:
            # Find last sentence boundary within the overlap area
            prefix = text[:max_overlap]
            m = list(SENTENCE_BOUNDARY.finditer(prefix))
            if m:
                cut = m[-1].end()
            else:
                # Fall back to last word boundary
                cut = prefix.rfind(' ')
                if cut < 0:
                    cut = max_overlap
                else:
                    cut += 1
            new_text = text[cut:].strip()
        else:
            new_text = text

        if new_text:
            results.append({
                "start": seg["start"],
                "end": seg["end"],
                "text": new_text,
            })
        prev = text

    return results


def _parse_srt(content: str) -> list[dict]:
    """Parse SRT content into {start, end, text} dicts."""
    import re

    pattern = re.compile(
        r"\d+\n"
        r"(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\n"
        r"((?:.+\n?)+?)(?=\n\d+\n|\Z)",
        re.MULTILINE,
    )

    results = []
    for m in pattern.finditer(content):
        text = re.sub(r"<[^>]+>", "", m.group(3).strip())
        if text:
            results.append({
                "start": _ts_to_seconds(m.group(1)),
                "end": _ts_to_seconds(m.group(2)),
                "text": text,
            })

    return results


def _ts_to_seconds(ts: str) -> float:
    """Convert 'HH:MM:SS.mmm' or 'HH:MM:SS,mmm' to seconds."""
    ts = ts.replace(",", ".")
    h, m, s = ts.split(":")
    return float(h) * 3600 + float(m) * 60 + float(s)


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=60, max_retries=3)
def transcribe_audio(self, audio_path: str) -> str:
    """Transcribe user audio via Whisper for speaking practice."""
    try:
        from app.services.transcription.whisper_model import get_whisper_model
        model = get_whisper_model()
        segments, _ = model.transcribe(audio_path, language="en")
        return " ".join([s.text for s in segments]).strip()
    except Exception as e:
        logger.exception("Whisper transcription failed")
        raise self.retry(exc=e)
