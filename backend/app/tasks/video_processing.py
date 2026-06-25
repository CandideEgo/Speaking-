import asyncio
import json
import logging
import time
from pathlib import Path

from app.core.config import get_settings
from app.services.ai_service import AIService
from app.services.transcription.audio_extractor import get_video_duration
from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

# Resolutions to transcode
TRANSCODE_PROFILES = {
    "480p": {"height": 480, "bitrate": "800k"},
    "720p": {"height": 720, "bitrate": "1500k"},
    "1080p": {"height": 1080, "bitrate": "3000k"},
}

# Processing step names and their progress percentages (monotonic with the
# split pipeline: head → GPU transcribe → callback → tail).
STEP_PROGRESS = {
    "extracting": 10,
    "transcribing": 30,
    "translating": 70,
    "downloading": 75,
    "transcoding": 90,
    "done": 100,
}

# Redis key TTLs
_LOCK_TTL_SECONDS = 30 * 60  # 30 minutes (per-task only; not held across the GPU gap)
_STEPS_TTL_SECONDS = 60 * 60  # 1 hour (cleared on completion anyway)


def _get_redis():
    """Get a Redis client using the configured URL."""
    import redis as redis_lib

    settings = get_settings()
    return redis_lib.from_url(settings.redis_url, decode_responses=True)


async def _update_progress(video_id: str, step: str, extra: dict | None = None) -> None:
    """Record a completed step in Redis and publish progress update.

    - Adds step name to Redis set "video:steps:{video_id}" (used for resume)
    - Publishes progress percentage to Redis channel "video:progress:{video_id}"

    Note: the DB ``processing_step``/``processing_progress`` fields (which the
    public ``/status`` endpoint reads) are written separately by each task.
    """
    progress = STEP_PROGRESS.get(step, 0)
    try:
        r = _get_redis()
        steps_key = f"video:steps:{video_id}"
        r.sadd(steps_key, step)
        r.expire(steps_key, _STEPS_TTL_SECONDS)

        payload = {"video_id": video_id, "step": step, "progress": progress}
        if extra:
            payload.update(extra)
        r.publish(f"video:progress:{video_id}", json.dumps(payload))
    except Exception:
        logger.warning("Failed to update progress for video %s step %s", video_id, step, exc_info=True)


async def _is_step_done(video_id: str, step: str) -> bool:
    """Check if a step has already been completed (for resume)."""
    try:
        r = _get_redis()
        return r.sismember(f"video:steps:{video_id}", step)
    except Exception:
        return False


def _acquire_lock(video_id: str) -> bool:
    """Try to acquire a Redis lock for processing this video. Returns True if acquired."""
    try:
        r = _get_redis()
        lock_key = f"video:processing:{video_id}"
        acquired = r.set(lock_key, "1", nx=True, ex=_LOCK_TTL_SECONDS)
        return bool(acquired)
    except Exception:
        logger.warning("Failed to acquire lock for video %s", video_id, exc_info=True)
        # If Redis is down, allow processing to proceed
        return True


def _release_lock(video_id: str) -> None:
    """Release the processing lock, keeping the completed-step set intact.

    Used by the pipeline head after enqueuing remote transcription: the lock is
    not held across the head→GPU→tail gap (its 30-min TTL cannot span it), so
    cross-task coordination relies on DB ``status``/``processing_step`` instead.
    """
    try:
        r = _get_redis()
        r.delete(f"video:processing:{video_id}")
    except Exception:
        logger.warning("Failed to release lock for video %s", video_id, exc_info=True)


def _release_lock_and_steps(video_id: str) -> None:
    """Release the processing lock and clear completed steps."""
    try:
        r = _get_redis()
        r.delete(f"video:processing:{video_id}", f"video:steps:{video_id}")
    except Exception:
        logger.warning("Failed to release lock/steps for video %s", video_id, exc_info=True)


def _find_local_raw(video_id: str) -> str | None:
    """Locate the staged raw file ``{video_id}_raw.*`` in the media directory."""
    media_dir = Path(get_settings().local_media_path).resolve()
    if not media_dir.exists():
        return None
    for f in media_dir.iterdir():
        if f.stem == f"{video_id}_raw":
            return str(f)
    return None


_ai_service: AIService | None = None


def _get_ai_service() -> AIService:
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service


async def _translate_subtitles(texts: list[str]) -> list[str | None]:
    """Translate subtitle texts in batches. Each batch is a separate LLM call for reliability."""
    ai = _get_ai_service()
    results: list[str | None] = [None] * len(texts)

    batch_size = 20
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        translations = await ai.translate_batch(batch)
        for j, t in enumerate(translations):
            results[i + j] = t

    return results


# ---------------------------------------------------------------------------
# Pipeline head: extract metadata, stage media, enqueue remote GPU transcription
# ---------------------------------------------------------------------------


async def _stage_local_upload(video) -> tuple[str, str]:
    """Rename a local upload to the canonical raw path and stage it on OSS.

    Returns ``(gpu_source_url, remote_key)`` where ``gpu_source_url`` is a
    signed URL (private bucket) or CDN URL (public bucket) the GPU worker can
    fetch without OSS credentials. Raises if OSS is not configured — local
    uploads cannot reach the GPU worker any other way.
    """
    from app.services import oss_service

    settings = get_settings()
    src = Path(video.source_url)
    if not src.exists():
        raise Exception(f"Local upload file not found: {video.source_url}")

    ext = src.suffix or ".mp4"
    media_dir = Path(settings.local_media_path).resolve()
    media_dir.mkdir(parents=True, exist_ok=True)
    raw_path = media_dir / f"{video.id}_raw{ext}"
    if src.resolve() != raw_path.resolve():
        src.rename(raw_path)
    # Keep source_url consistent with the rest of the pipeline (delete/resume
    # glob on {id}_raw.*).
    video.source_url = str(raw_path)

    remote_key = f"{settings.oss_raw_prefix}/{video.id}{ext}"
    cdn_url = await oss_service.upload_file(str(raw_path), remote_key)
    if not cdn_url:
        raise Exception("OSS upload failed (not configured?) — cannot transfer local upload to GPU worker")
    if settings.oss_raw_bucket_public:
        gpu_source = cdn_url
    else:
        gpu_source = oss_service.get_signed_url(remote_key, expires=settings.oss_signed_url_expiry)
        if not gpu_source:
            raise Exception("OSS signed URL generation failed")
    return gpu_source, remote_key


@celery_app.task(bind=True, max_retries=3)
def process_video(self, video_id: str):
    """Head of the video pipeline: extract metadata, stage media, enqueue GPU transcription.

    Transcription itself runs on a remote GPU worker (``transcription_gpu``
    queue); this task only prepares the job and hands it off. The tail
    (``finalize_video``) is triggered by the transcription callback endpoint
    once subtitles arrive. The lock is released before the gap — cross-task
    coordination uses DB ``status``/``processing_step``.
    """
    if not _acquire_lock(video_id):
        logger.warning("Video %s is already being processed, skipping", video_id)
        return

    from sqlalchemy import select

    from app.core.database import async_session
    from app.models.video import Video, VideoSource, VideoStatus

    async def _process():
        async with async_session() as db:
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()
            if not video:
                logger.error("Video %s not found", video_id)
                _release_lock_and_steps(video_id)
                return

            try:
                settings = get_settings()

                # --- Step: extracting (metadata) ---
                if video.video_source == VideoSource.imported:
                    info = await _extract_video_info(video.source_url)
                    if info is None:
                        raise Exception(f"Failed to extract video info from {video.source_url}")
                    video.title = info.get("title") or video.title
                    video.thumbnail_url = info.get("thumbnail")
                    video.duration = info.get("duration")
                else:  # local upload — yt-dlp can't read a local path; use ffprobe
                    video.duration = get_video_duration(video.source_url)
                    if not video.title:
                        video.title = Path(video.source_url).stem
                video.processing_step = "extracting"
                video.processing_progress = 10
                await db.commit()
                await _update_progress(video_id, "extracting")

                # --- Stage media for the GPU worker ---
                if video.video_source == VideoSource.imported:
                    # GPU worker streams audio from the source URL via yt-dlp.
                    gpu_source = video.source_url
                    gpu_platform = VideoSource.imported.value
                else:
                    # Local upload → OSS (signed URL) so the GPU worker can fetch it.
                    gpu_source, _raw_key = await _stage_local_upload(video)
                    gpu_platform = VideoSource.local.value

                # --- Enqueue remote transcription ---
                video.status = VideoStatus.processing
                video.processing_step = "transcribing"
                video.processing_progress = 30
                await db.commit()
                await _update_progress(video_id, "transcribing")

                transcribe_video_gpu.apply_async(
                    args=[video.id, gpu_source, gpu_platform],
                    queue=settings.transcription_gpu_queue_name,
                )
                logger.info("Video %s: enqueued GPU transcription", video_id)

                # Release the lock but keep the step-set; the gap to the tail is
                # bridged by DB status, not a held lock.
                _release_lock(video_id)

            except Exception as e:
                logger.exception("Video %s head processing failed", video_id)
                video.status = VideoStatus.error
                video.error_message = str(e)
                await db.commit()
                if self.request.retries >= self.max_retries:
                    _release_lock_and_steps(video_id)
                raise self.retry(exc=e) from e

    try:
        run_async(_process())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_process())
        finally:
            loop.close()


# ---------------------------------------------------------------------------
# GPU worker task: transcribe and POST subtitles back via HTTP callback
# ---------------------------------------------------------------------------


def _post_transcription_callback(
    video_id: str, status: str, segments: list[dict] | None = None, error: str | None = None
) -> bool:
    """POST transcription results to the cloud callback endpoint.

    Retries 5xx / transport errors with exponential backoff; 4xx responses are
    not retried (permanent client-side problem). Returns True on acknowledged
    delivery. Used by the GPU worker, which has no database access.
    """
    import httpx

    settings = get_settings()
    url = settings.transcription_callback_url
    if not url:
        logger.error("TRANSCRIPTION_CALLBACK_URL not set; cannot deliver transcription for %s", video_id)
        return False

    payload = {
        "video_id": video_id,
        "status": status,
        "segments": (
            [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in segments]
            if status == "ok" and segments
            else None
        ),
        "error": error,
    }
    headers = {"X-Callback-Secret": settings.transcription_callback_secret}
    max_retries = settings.transcription_callback_max_retries
    timeout = settings.transcription_callback_timeout

    for attempt in range(max_retries + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(url, json=payload, headers=headers)
            if 200 <= resp.status_code < 300:
                logger.info("Transcription callback delivered", video_id=video_id, status=status, attempt=attempt)
                return True
            if 400 <= resp.status_code < 500:
                logger.error(
                    "Transcription callback rejected (4xx, not retrying)",
                    video_id=video_id,
                    code=resp.status_code,
                    body=resp.text[:200],
                )
                return False
            # 5xx → fall through to retry
        except httpx.HTTPError as e:
            logger.warning("Transcription callback error", video_id=video_id, attempt=attempt, error=str(e))
        if attempt < max_retries:
            time.sleep(min(2**attempt, 30))
    logger.error("Transcription callback exhausted retries", video_id=video_id, status=status)
    return False


@celery_app.task(bind=True, max_retries=3, name="app.tasks.video_processing.transcribe_video_gpu")
def transcribe_video_gpu(self, video_id: str, source: str, platform: str, language: str | None = None):
    """Transcribe a video on the GPU worker and POST subtitles back to the cloud.

    Runs on a remote machine (``transcription_gpu`` queue). Does NOT touch the
    database — results are delivered via HTTP callback so the worker needs no
    ``DATABASE_URL``. ``language`` is reserved for future use (v1 relies on the
    worker's ``WHISPER_LANGUAGE`` setting).
    """
    from app.models.video import VideoSource
    from app.services.transcription import TranscriptionService

    try:
        svc = TranscriptionService()
        segments = svc._sync_transcribe(source, VideoSource(platform))
        _post_transcription_callback(video_id, status="ok", segments=segments)
    except Exception as e:
        logger.exception("GPU transcription failed for video %s", video_id)
        if self.request.retries >= self.max_retries:
            # Let the cloud know transcription is unrecoverable so it can mark
            # the video failed instead of waiting for the watchdog.
            _post_transcription_callback(video_id, status="error", error=str(e))
            raise
        raise self.retry(exc=e, countdown=60) from e


# ---------------------------------------------------------------------------
# Pipeline tail: translate → download → transcode → ready (triggered by callback)
# ---------------------------------------------------------------------------


@celery_app.task(bind=True, max_retries=3, name="app.tasks.video_processing.finalize_video")
def finalize_video(self, video_id: str):
    """Tail of the video pipeline: translate → download → transcode → ready.

    Triggered by the transcription callback endpoint once subtitles arrive from
    the GPU worker. Runs on the cloud (default ``celery`` queue).
    """
    if not _acquire_lock(video_id):
        logger.warning("Video %s is already being processed, skipping finalize", video_id)
        return

    from sqlalchemy import select

    from app.core.database import async_session
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoSource, VideoStatus

    async def _process():
        async with async_session() as db:
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()
            if not video:
                logger.error("Video %s not found for finalize", video_id)
                _release_lock_and_steps(video_id)
                return

            try:
                # --- Step: translating ---
                if not await _is_step_done(video_id, "translating"):
                    sub_result = await db.execute(
                        select(Subtitle).where(Subtitle.video_id == video.id).order_by(Subtitle.sentence_index)
                    )
                    sub_rows = list(sub_result.scalars().all())
                    texts = [s.text_en for s in sub_rows if s.text_en]
                    translated = await _translate_subtitles(texts)
                    for i, t in enumerate(translated):
                        if t and i < len(sub_rows):
                            sub_rows[i].text_zh = t
                    video.processing_step = "translating"
                    video.processing_progress = 70
                    await db.commit()
                    await _update_progress(video_id, "translating")
                else:
                    logger.info("Video %s: skipping translating (already done)", video_id)

                # --- Step: downloading ---
                video_path = None
                if not await _is_step_done(video_id, "downloading"):
                    if video.video_source == VideoSource.imported:
                        video_path = await _download_video(video.source_url, video.id)
                        if not video_path:
                            raise Exception(f"Failed to download video from {video.source_url}")
                    else:
                        # Local upload: raw file already staged by the head.
                        video_path = _find_local_raw(video.id)
                        if not video_path:
                            raise Exception(f"Raw video file not found for local upload {video_id}")
                    video.processing_step = "downloading"
                    video.processing_progress = 75
                    await db.commit()
                    await _update_progress(video_id, "downloading")
                else:
                    logger.info("Video %s: skipping downloading (already done)", video_id)
                    if video.video_source != VideoSource.imported:
                        video_path = _find_local_raw(video.id)

                # --- Step: transcoding ---
                if not await _is_step_done(video_id, "transcoding"):
                    if video_path:
                        urls = await _transcode_video(video_path, video.id)
                        video.video_url_480p = urls.get("480p")
                        video.video_url_720p = urls.get("720p", f"/media/{video.id}.mp4")
                        video.video_url_1080p = urls.get("1080p")
                    else:
                        logger.warning("No video file to transcode for %s", video_id)
                    video.processing_step = "transcoding"
                    video.processing_progress = 90
                    await db.commit()
                    await _update_progress(video_id, "transcoding")
                else:
                    logger.info("Video %s: skipping transcoding (already done)", video_id)

                # --- Step: done ---
                video.status = VideoStatus.ready
                video.processing_step = None
                video.processing_progress = 100
                await db.commit()
                await _update_progress(video_id, "done")
                _release_lock_and_steps(video_id)
                logger.info("Video %s finalized", video_id)

                # Best-effort OSS cleanup of the staged raw upload.
                if video.video_source != VideoSource.imported:
                    await _cleanup_oss_raw(video.id, video.source_url)

            except Exception as e:
                logger.exception("Video %s finalize failed", video_id)
                video.status = VideoStatus.error
                video.error_message = str(e)
                await db.commit()
                if self.request.retries >= self.max_retries:
                    _release_lock_and_steps(video_id)
                raise self.retry(exc=e) from e

    try:
        run_async(_process())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_process())
        finally:
            loop.close()


async def _cleanup_oss_raw(video_id: str, source_url: str) -> None:
    """Best-effort deletion of the staged raw upload from OSS."""
    from app.services import oss_service

    ext = Path(source_url).suffix or ".mp4"
    remote_key = f"{get_settings().oss_raw_prefix}/{video_id}{ext}"
    await oss_service.delete_file(remote_key)


# ---------------------------------------------------------------------------
# Watchdog: fail videos whose GPU transcription never returned
# ---------------------------------------------------------------------------


@celery_app.task(name="app.tasks.video_processing.watchdog_stale_transcriptions")
def watchdog_stale_transcriptions():
    """Mark videos stuck in "transcribing" as failed (GPU worker offline).

    A video is created and immediately enqueued for transcription, so
    ``created_at`` is a close proxy for when transcription started. If it has
    been in ``transcribing`` longer than ``video_transcribe_timeout``, the GPU
    worker is assumed lost and the video is failed so the user can re-submit.
    """
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from app.core.database import async_session
    from app.models.video import Video, VideoStatus

    timeout = get_settings().video_transcribe_timeout
    cutoff = datetime.now(UTC) - timedelta(seconds=timeout)

    async def _run():
        async with async_session() as db:
            result = await db.execute(
                select(Video).where(
                    Video.processing_step == "transcribing",
                    Video.status == VideoStatus.processing,
                    Video.created_at < cutoff,
                )
            )
            stuck = list(result.scalars().all())
            for v in stuck:
                v.status = VideoStatus.error
                v.error_message = "Transcription timed out (GPU worker offline?)"
                v.processing_step = None
                _release_lock_and_steps(v.id)
                logger.warning("Watchdog: marked stale transcription as failed", video_id=v.id)
            if stuck:
                await db.commit()

    try:
        run_async(_run())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run())
        finally:
            loop.close()


# ---------------------------------------------------------------------------
# yt-dlp / ffmpeg helpers (cloud-side)
# ---------------------------------------------------------------------------


async def _extract_video_info(url: str) -> dict | None:
    """Extract video metadata (title, thumbnail, duration) via yt-dlp without downloading."""
    import yt_dlp

    settings = get_settings()
    loop = asyncio.get_event_loop()

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

    settings = get_settings()
    media_dir = Path(settings.local_media_path).resolve()
    media_dir.mkdir(parents=True, exist_ok=True)
    output = str(media_dir / f"{video_id}_raw.%(ext)s")

    loop = asyncio.get_event_loop()

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
    settings = get_settings()
    media_dir = Path(settings.local_media_path).resolve()
    source = Path(source_path)

    if not source.exists():
        logger.error(f"Source video not found for transcoding: {source_path}")
        return {}

    urls: dict[str, str] = {}
    source_res = await _get_video_height(source_path)

    for label, profile in TRANSCODE_PROFILES.items():
        # Skip if source is already lower res than target
        if source_res and source_res < profile["height"]:
            logger.info(f"Skipping {label} - source is only {source_res}p")
            continue

        out_name = f"{video_id}_{label}.mp4"
        out_path = media_dir / out_name

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-vf",
            f"scale=-2:{profile['height']}",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-b:v",
            profile["bitrate"],
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
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
                logger.info(f"Transcoded {label}: {out_name}")
            else:
                logger.error(f"FFmpeg {label} failed: {stderr.decode()[:200]}")
        except FileNotFoundError:
            logger.warning("FFmpeg not installed - skipping video transcoding")
            return {}
        except Exception:
            logger.exception(f"Transcoding {label} failed")

    return urls


async def _get_video_height(path: str) -> int | None:
    """Get video height using ffprobe."""
    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=height",
        "-of",
        "csv=p=0",
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


# ---------------------------------------------------------------------------
# Admin "搬运到本地" (download + transcode only; no transcription)
# ---------------------------------------------------------------------------


@celery_app.task(bind=True, max_retries=2)
def localize_video(self, video_id: str):
    """Download + transcode a video's source to local storage (admin "搬运到本地").

    A lightweight variant of the pipeline used by the admin content-management
    panel to backfill local video files for an imported (e.g. YouTube) video
    that already has subtitles/AI done. It deliberately skips transcription and
    translation — those now run via the GPU worker / tail pipeline.

    Reuses ``_download_video`` + ``_transcode_video`` and the same Redis
    lock / progress reporting as the full pipeline.
    """
    if not _acquire_lock(video_id):
        logger.warning("Video %s is already being processed, skipping localize", video_id)
        return

    from sqlalchemy import select

    from app.core.database import async_session
    from app.models.video import Video, VideoStatus

    async def _localize():
        async with async_session() as db:
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()
            if not video:
                logger.error("Video %s not found for localize", video_id)
                _release_lock_and_steps(video_id)
                return

            try:
                # --- Step: downloading ---
                if not await _is_step_done(video_id, "downloading"):
                    await _update_progress(video_id, "downloading")
                    video_path = await _download_video(video.source_url, video.id)
                    if not video_path:
                        raise Exception(f"Failed to download video from {video.source_url}")
                else:
                    video_path = _find_local_raw(video.id)

                # --- Step: transcoding ---
                if not await _is_step_done(video_id, "transcoding"):
                    if video_path:
                        urls = await _transcode_video(video_path, video.id)
                        video.video_url_480p = urls.get("480p")
                        video.video_url_720p = urls.get("720p", f"/media/{video.id}.mp4")
                        video.video_url_1080p = urls.get("1080p")
                        await db.commit()
                    else:
                        logger.warning("No video file to transcode for %s", video_id)
                    await _update_progress(video_id, "transcoding")

                # --- Step: done ---
                video.status = VideoStatus.ready
                video.processing_step = None
                await db.commit()
                await _update_progress(video_id, "done")
                _release_lock_and_steps(video_id)
                logger.info("Video %s localized to local storage", video_id)

            except Exception as e:
                logger.exception("Video %s localize failed", video_id)
                video.status = VideoStatus.error
                video.error_message = str(e)
                await db.commit()
                if self.request.retries >= self.max_retries:
                    logger.error("Video %s: max retries reached, releasing lock", video_id)
                    _release_lock_and_steps(video_id)
                raise self.retry(exc=e) from e

    try:
        run_async(_localize())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_localize())
        finally:
            loop.close()
