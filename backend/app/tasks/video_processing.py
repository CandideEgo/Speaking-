import asyncio
import time
from pathlib import Path

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services import ecdict
from app.services.transcription.audio_extractor import get_video_duration
from app.tasks.celery_app import celery_app
from app.tasks.pipeline_helpers import (
    STEP_PROGRESS,
    acquire_lock,
    commit_error_state,
    is_step_done,
    release_lock,
    release_lock_and_steps,
    run_pipeline_task,
    update_progress,
)

logger = get_logger(__name__)

# Resolutions to transcode
TRANSCODE_PROFILES = {
    "480p": {"height": 480, "bitrate": "800k"},
    "720p": {"height": 720, "bitrate": "1500k"},
    "1080p": {"height": 1080, "bitrate": "3000k"},
}


def _find_local_raw(video_id: str) -> str | None:
    """Locate the staged raw file ``{video_id}_raw.*`` in the media directory."""
    media_dir = Path(get_settings().local_media_path).resolve()
    if not media_dir.exists():
        return None
    for f in media_dir.iterdir():
        if f.stem == f"{video_id}_raw":
            return str(f)
    return None


async def _translate_subtitles(texts: list[str]) -> list[str | None]:
    """Translate subtitle texts in batches using TranslationService.

    Uses the pluggable TranslationService (with engine selection + fallback)
    instead of AIService.translate_batch which has no fallback support.
    """
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


# ---------------------------------------------------------------------------
# Pipeline head: extract metadata, stage media, enqueue remote GPU transcription
# ---------------------------------------------------------------------------


async def _stage_local_upload(video) -> tuple[str, str]:
    """Rename a local upload to the canonical raw path and stage it on OSS.

    Returns ``(gpu_source, remote_key)`` where ``gpu_source`` is a signed URL
    (private bucket) or CDN URL (public bucket) the GPU worker can fetch
    without OSS credentials. When OSS is not configured (dev, GPU worker on the
    same host), falls back to the local raw file path so the worker reads it
    directly — ``remote_key`` is empty in that case.
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
    if cdn_url:
        if settings.oss_raw_bucket_public:
            gpu_source = cdn_url
        else:
            gpu_source = oss_service.get_signed_url(remote_key, expires=settings.oss_signed_url_expiry)
            if not gpu_source:
                raise Exception("OSS signed URL generation failed")
        return gpu_source, remote_key

    # OSS not configured (dev): when the GPU worker runs on the same host as
    # the cloud backend, it can read the local raw file directly — skip the
    # OSS round-trip. Production has OSS enabled and never hits this branch.
    logger.info("OSS not configured; GPU worker will read local raw file", video_id=video.id)
    return str(raw_path), ""


@celery_app.task(bind=True, max_retries=3)
def process_video(self, video_id: str):
    """Head of the video pipeline: extract metadata, stage media, enqueue GPU transcription.

    Transcription itself runs on a remote GPU worker (``transcription_gpu``
    queue); this task only prepares the job and hands it off. The tail
    (``finalize_video``) is triggered by the transcription callback endpoint
    once subtitles arrive. The lock is released before the gap — cross-task
    coordination uses DB ``status``/``processing_step``.
    """
    if not acquire_lock(video_id):
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
                release_lock_and_steps(video_id)
                return

            try:
                settings = get_settings()

                # --- Resume check: skip transcription if subtitles exist ---
                # If subtitles are already in the DB, a prior run's transcription
                # succeeded (the callback only inserts on status=ok). Re-enqueuing
                # GPU transcription would waste GPU time and risk clobbering good
                # subtitles. Jump straight to the tail; finalize_video's
                # is_step_done() checks then skip any steps that already finished.
                from app.services.video_service import count_subtitles

                subtitle_count = await count_subtitles(db, video.id)
                if subtitle_count > 0:
                    logger.info(
                        "Video %s: subtitles already exist (%d), skipping transcription",
                        video_id,
                        subtitle_count,
                    )
                    video.status = VideoStatus.ready_subtitles
                    video.processing_step = "translating"
                    video.processing_progress = 70
                    await db.commit()
                    release_lock(video_id)
                    finalize_video.delay(video_id)
                    return

                # --- Pre-check: refresh YouTube cookies if needed ---
                if video.video_source == VideoSource.imported:
                    from app.services.youtube_cookies_service import ensure_cookies_for_pipeline

                    cookie_result = await ensure_cookies_for_pipeline(video.source_url)
                    if cookie_result.status == "ok":
                        logger.info("Video %s: cookies valid", video_id)
                    elif cookie_result.cookies_path:
                        logger.warning(
                            "Video %s: cookies %s — continuing with existing file",
                            video_id,
                            cookie_result.message,
                        )
                    else:
                        logger.info(
                            "Video %s: no cookies file — proceeding without cookies (%s)",
                            video_id,
                            cookie_result.message,
                        )

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
                await update_progress(video_id, "extracting")

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
                await update_progress(video_id, "transcribing")

                transcribe_video_gpu.apply_async(
                    args=[video.id, gpu_source, gpu_platform],
                    queue=settings.transcription_gpu_queue_name,
                )
                logger.info("Video %s: enqueued GPU transcription", video_id)

                # Release the lock but keep the step-set; the gap to the tail is
                # bridged by DB status, not a held lock.
                release_lock(video_id)

            except Exception as e:
                logger.exception("Video %s head processing failed", video_id)
                await commit_error_state(video, db, e)
                if self.request.retries >= self.max_retries:
                    release_lock_and_steps(video_id)
                raise self.retry(exc=e) from e

    run_pipeline_task(_process())


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


async def _register_standard(db, video) -> None:
    """Register ``video`` as the standard version for its ``source_url``.

    First-ready-wins: if a standard already exists for this URL (a concurrent
    finalize on a duplicate submission, or a prior ready), the INSERT becomes
    a no-op. The ``video_standards.source_url`` PK is the race backstop — two
    finalizes cannot both register a standard for the same URL.

    Dialect-specific INSERT ... ON CONFLICT DO NOTHING (Postgres + SQLite both
    support it; tests run on SQLite, prod on Postgres). Failure here is
    non-fatal: the video is already ``ready``, and the standard can be
    backfilled later, so we log and continue rather than failing finalize.
    """
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    from app.models.video_standard import VideoStandard

    try:
        dialect = db.bind.dialect.name
        stmt = (
            (pg_insert(VideoStandard) if dialect == "postgresql" else sqlite_insert(VideoStandard))
            .values(source_url=video.source_url, canonical_video_id=video.id)
            .on_conflict_do_nothing(index_elements=["source_url"])
        )
        await db.execute(stmt)
        await db.commit()
    except Exception:
        logger.warning("Video %s: failed to register standard version (continuing)", video.id, exc_info=True)


@celery_app.task(bind=True, max_retries=3, name="app.tasks.video_processing.finalize_video")
def finalize_video(self, video_id: str):
    """Tail of the video pipeline: translate → download → transcode → ready.

    Triggered by the transcription callback endpoint once subtitles arrive from
    the GPU worker. Runs on the cloud (default ``celery`` queue).
    """
    if not acquire_lock(video_id):
        logger.warning("Video %s is already being processed, skipping finalize", video_id)
        return

    from sqlalchemy import select

    from app.core.database import async_session
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus

    async def _process():
        async with async_session() as db:
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()
            if not video:
                logger.error("Video %s not found for finalize", video_id)
                release_lock_and_steps(video_id)
                return

            try:
                # --- Step: translating ---
                if not await is_step_done(video_id, "translating"):
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
                    await update_progress(video_id, "translating")
                else:
                    logger.info("Video %s: skipping translating (already done)", video_id)

                # --- Step: annotating (CET/高考/考研 exam-level word tags) ---
                # Pure local ECDICT lookup — no AI. Populates Subtitle.word_levels
                # (lemma -> exam level keys) once, level-agnostic, so the watch
                # page can filter by the user's target exam at display time.
                # Skipped gracefully when the ECDICT db is absent (word_levels null).
                if not await is_step_done(video_id, "annotating"):
                    if ecdict.is_available():
                        ann_result = await db.execute(
                            select(Subtitle).where(Subtitle.video_id == video.id).order_by(Subtitle.sentence_index)
                        )
                        for s in ann_result.scalars().all():
                            levels = ecdict.annotate_text(s.text_en)
                            s.word_levels = levels or None
                        video.processing_step = "annotating"
                        video.processing_progress = 72
                        await db.commit()
                        await update_progress(video_id, "annotating")
                    else:
                        logger.warning(
                            "Video %s: skipping annotating (ECDICT db missing at %s)",
                            video_id,
                            ecdict.DB_PATH,
                        )
                        await update_progress(video_id, "annotating")
                else:
                    logger.info("Video %s: skipping annotating (already done)", video_id)

                # --- Step: prewarm_notes (per-video AI learning notes) ---
                # Batch-generate contextual_note / pitfalls / knowledge for the
                # video's exam-tagged words, stored as video:{id} rows so the
                # gloss endpoint can return <10ms responses. Resume-safe.
                if not await is_step_done(video_id, "prewarm_notes"):
                    if not ecdict.is_available():
                        logger.info(
                            "Video %s: skipping prewarm_notes (no ECDICT — no words to annotate)",
                            video_id,
                        )
                        await update_progress(video_id, "prewarm_notes")
                    else:
                        try:
                            from app.services.word_notes import prewarm_video_notes

                            await prewarm_video_notes(db, video.id)
                            video.processing_step = "prewarm_notes"
                            video.processing_progress = 74
                            await db.commit()
                            await update_progress(video_id, "prewarm_notes")
                        except Exception as exc:
                            # Prewarm is an enhancement; don't fail the
                            # pipeline if the LLM is down. The gloss endpoint
                            # will fall back to live AI / global notes.
                            logger.warning("Video %s: prewarm_notes skipped (%s)", video_id, exc)
                            await update_progress(video_id, "prewarm_notes")
                else:
                    logger.info("Video %s: skipping prewarm_notes (already done)", video_id)

                # --- Step: downloading ---
                video_path = None
                if not await is_step_done(video_id, "downloading"):
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
                    await update_progress(video_id, "downloading")
                else:
                    logger.info("Video %s: skipping downloading (already done)", video_id)
                    if video.video_source != VideoSource.imported:
                        video_path = _find_local_raw(video.id)

                # --- Step: transcoding ---
                if not await is_step_done(video_id, "transcoding"):
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
                    await update_progress(video_id, "transcoding")
                else:
                    logger.info("Video %s: skipping transcoding (already done)", video_id)

                # --- Step: done ---
                video.status = VideoStatus.ready
                video.processing_step = None
                video.processing_progress = 100
                await db.commit()
                await update_progress(video_id, "done")
                release_lock_and_steps(video_id)
                logger.info("Video %s finalized", video_id)

                # Phase 2: register as the standard version for this source_url
                # (first ready wins; no-op if a standard already exists).
                await _register_standard(db, video)

                # Auto-publish once ready. Only official videos with
                # auto_publish=True are published immediately; UGC videos
                # always stay in draft after processing so the creator can
                # edit subtitles/practice before submitting for admin review.
                if video.auto_publish and not video.is_published and video.is_official:
                    video.is_published = True
                    video.review_status = VideoReviewStatus.published.value
                    await db.commit()
                    try:
                        from app.services.video_cache import invalidate_browse_cache

                        await invalidate_browse_cache()
                    except Exception:
                        logger.warning(
                            "auto_publish browse cache invalidation failed", video_id=video_id, exc_info=True
                        )
                    logger.info("Video %s auto-published (official)", video_id)

                # Best-effort OSS cleanup of the staged raw upload.
                if video.video_source != VideoSource.imported:
                    await _cleanup_oss_raw(video.id, video.source_url)

            except Exception as e:
                logger.exception("Video %s finalize failed", video_id)
                await commit_error_state(video, db, e)
                if self.request.retries >= self.max_retries:
                    release_lock_and_steps(video_id)
                raise self.retry(exc=e) from e

    run_pipeline_task(_process())


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

    Uses ``processing_started_at`` (set when processing actually begins) rather
    than ``created_at`` to avoid prematurely killing videos where admin delayed
    triggering ``start_processing``.  Falls back to ``created_at`` for rows
    where ``processing_started_at`` is NULL (legacy data).
    """
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import and_, or_, select

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
                    # Use processing_started_at when available; fall back to
                    # created_at for legacy rows that predate the column.
                    or_(
                        Video.processing_started_at < cutoff,
                        and_(Video.processing_started_at.is_(None), Video.created_at < cutoff),
                    ),
                )
            )
            stuck = list(result.scalars().all())
            for v in stuck:
                v.status = VideoStatus.error
                v.error_message = "Transcription timed out (GPU worker offline?)"
                v.processing_step = None
                release_lock_and_steps(v.id)
                logger.warning("Watchdog: marked stale transcription as failed", video_id=v.id)
            if stuck:
                await db.commit()

    run_pipeline_task(_run())


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
    if not acquire_lock(video_id):
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
                release_lock_and_steps(video_id)
                return

            try:
                # --- Step: downloading ---
                if not await is_step_done(video_id, "downloading"):
                    await update_progress(video_id, "downloading")
                    video_path = await _download_video(video.source_url, video.id)
                    if not video_path:
                        raise Exception(f"Failed to download video from {video.source_url}")
                else:
                    video_path = _find_local_raw(video.id)

                # --- Step: transcoding ---
                if not await is_step_done(video_id, "transcoding"):
                    if video_path:
                        urls = await _transcode_video(video_path, video.id)
                        video.video_url_480p = urls.get("480p")
                        video.video_url_720p = urls.get("720p", f"/media/{video.id}.mp4")
                        video.video_url_1080p = urls.get("1080p")
                        await db.commit()
                    else:
                        logger.warning("No video file to transcode for %s", video_id)
                    await update_progress(video_id, "transcoding")

                # --- Step: done ---
                video.status = VideoStatus.ready
                video.processing_step = None
                await db.commit()
                await update_progress(video_id, "done")
                release_lock_and_steps(video_id)
                logger.info("Video %s localized to local storage", video_id)

            except Exception as e:
                logger.exception("Video %s localize failed", video_id)
                await commit_error_state(video, db, e)
                if self.request.retries >= self.max_retries:
                    logger.error("Video %s: max retries reached, releasing lock", video_id)
                    release_lock_and_steps(video_id)
                raise self.retry(exc=e) from e

    run_pipeline_task(_localize())
