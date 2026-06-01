import logging
import re
import tempfile
import os
import subprocess
import json
import asyncio
from pathlib import Path

from app.tasks.celery_app import celery_app
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

# Resolutions to transcode
TRANSCODE_PROFILES = {
    '480p': {'height': 480, 'bitrate': '800k'},
    '720p': {'height': 720, 'bitrate': '1500k'},
    '1080p': {'height': 1080, 'bitrate': '3000k'},
}

def _extract_youtube_video_id(url: str) -> str | None:
    """Extract YouTube video ID from a URL."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


async def _run_ai_pipeline(texts: list[str]) -> tuple[list[str], list[str], str, list[dict], list[list[str]]]:
    """Shared AI pipeline: translate, grammar analyze, difficulty, quiz generation, difficulty words."""
    ai = AIService()
    all_text = " ".join(texts)

    # Extract difficulty words for each sentence (batched to 5 at a time)
    difficulty_words_results: list[list[str]] = []
    for i in range(0, len(texts), 5):
        batch = texts[i : i + 5]
        batch_results = await asyncio.gather(
            *[ai.extract_difficulty_words(t) for t in batch]
        )
        difficulty_words_results.extend(batch_results)

    translate_results, grammar_results, difficulty, quiz_results = await asyncio.gather(
        ai.translate_batch(texts),
        ai.grammar_analyze_batch(texts),
        ai.evaluate_difficulty(all_text),
        ai.generate_quiz(all_text),
    )
    return translate_results, grammar_results, difficulty, quiz_results, difficulty_words_results


@celery_app.task(bind=True, max_retries=3)
def process_video(self, video_id: str):
    """Full video processing pipeline: download, transcode, extract subtitles, translate, analyze, quizify."""
    from sqlalchemy import select
    from app.core.database import async_session
    from app.models.video import Video, VideoStatus
    from app.models.subtitle import Subtitle

    async def _process():
        async with async_session() as db:
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()
            if not video:
                logger.error(f"Video {video_id} not found")
                return

            try:
                skip_ai = video.status == VideoStatus.ready_subtitles and video.subtitles

                if not skip_ai:
                    # Phase 1 / full pipeline: extract metadata + subtitles + AI
                    info = await _extract_video_info(video.source_url)
                    if info:
                        video.title = info.get('title', video.title)
                        video.thumbnail_url = info.get('thumbnail')
                        video.duration = info.get('duration')
                        video.youtube_video_id = video.youtube_video_id or info.get('youtube_video_id')

                    subs = await _extract_subtitles(video.source_url)
                    if not subs:
                        video.status = VideoStatus.error
                        video.error_message = "No subtitles found. Try a different video."
                        await db.commit()
                        return

                    texts = [s["text"] for s in subs]
                    translated, grammar_batch, difficulty, quiz_questions, difficulty_words = await _run_ai_pipeline(texts)

                    for i, sub in enumerate(subs):
                        dw = difficulty_words[i] if i < len(difficulty_words) else []
                        db.add(
                            Subtitle(
                                video_id=video.id,
                                start_time=sub["start"],
                                end_time=sub["end"],
                                text_en=sub["text"],
                                text_zh=translated[i] if i < len(translated) else None,
                                sentence_index=i,
                                grammar_note=grammar_batch[i] if i < len(grammar_batch) else None,
                                difficulty_words=json.dumps(dw) if dw else None,
                            )
                        )

                    video.difficulty_level = difficulty
                    video.quiz_data = quiz_questions

                # Phase 2: Download + transcode video
                video_path = await _download_video(video.source_url, video.id)

                if video_path:
                    urls = await _transcode_video(video_path, video.id)
                    video.video_url_480p = urls.get('480p')
                    video.video_url_720p = urls.get('720p', f"/media/{video.id}.mp4")
                    video.video_url_1080p = urls.get('1080p')
                else:
                    logger.warning(f"No video file downloaded for {video_id}")

                video.status = VideoStatus.ready
                await db.commit()
                logger.info(f"Video {video_id} processed")

            except Exception as e:
                logger.exception(f"Video {video_id} processing failed")
                video.status = VideoStatus.error
                video.error_message = str(e)
                await db.commit()
                raise self.retry(exc=e)

    asyncio.run(_process())


@celery_app.task(bind=True, max_retries=3)
def process_video_lightweight(self, video_id: str):
    """Phase 1: extract metadata + subtitles + AI processing (no video download)."""
    from sqlalchemy import select
    from app.core.database import async_session
    from app.models.video import Video, VideoStatus
    from app.models.subtitle import Subtitle

    async def _process():
        async with async_session() as db:
            result = await db.execute(select(Video).where(Video.id == video_id))
            video = result.scalar_one_or_none()
            if not video:
                logger.error(f"Video {video_id} not found")
                return

            try:
                info = await _extract_video_info(video.source_url)
                if info:
                    video.title = info.get('title', video.title)
                    video.thumbnail_url = info.get('thumbnail')
                    video.duration = info.get('duration')
                    video.youtube_video_id = info.get('youtube_video_id')

                subs = await _extract_subtitles(video.source_url)
                if not subs:
                    video.status = VideoStatus.error
                    video.error_message = "No subtitles found. Try a different video."
                    await db.commit()
                    return

                texts = [s["text"] for s in subs]
                translated, grammar_batch, difficulty, quiz_questions, difficulty_words = await _run_ai_pipeline(texts)

                for i, sub in enumerate(subs):
                    dw = difficulty_words[i] if i < len(difficulty_words) else []
                    db.add(
                        Subtitle(
                            video_id=video.id,
                            start_time=sub["start"],
                            end_time=sub["end"],
                            text_en=sub["text"],
                            text_zh=translated[i] if i < len(translated) else None,
                            sentence_index=i,
                            grammar_note=grammar_batch[i] if i < len(grammar_batch) else None,
                            difficulty_words=json.dumps(dw) if dw else None,
                        )
                    )

                video.difficulty_level = difficulty
                video.quiz_data = quiz_questions
                video.processing_mode = "lightweight"
                video.status = VideoStatus.ready_subtitles
                await db.commit()
                logger.info(f"Video {video_id} lightweight: {len(subs)} subtitles, level {difficulty}")

                # Dispatch Phase 2 for full download
                process_video.delay(video_id)

            except Exception as e:
                logger.exception(f"Video {video_id} lightweight processing failed")
                video.status = VideoStatus.error
                video.error_message = str(e)
                await db.commit()
                raise self.retry(exc=e)

    asyncio.run(_process())


async def _extract_video_info(url: str) -> dict | None:
    """Extract video metadata (title, thumbnail, duration) via yt-dlp without downloading."""
    import yt_dlp

    loop = asyncio.get_event_loop()

    def _sync_extract():
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
        }
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

    loop = asyncio.get_event_loop()

    def _sync_download():
        opts = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
            "outtmpl": output,
            "merge_output_format": "mp4",
        }
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
        logger.error(f"Source video not found for transcoding: {source_path}")
        return {}

    urls: dict[str, str] = {}
    source_res = await _get_video_height(source_path)

    for label, profile in TRANSCODE_PROFILES.items():
        # Skip if source is already lower res than target
        if source_res and source_res < profile['height']:
            logger.info(f"Skipping {label} �� source is only {source_res}p")
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
                logger.info(f"Transcoded {label}: {out_name}")
            else:
                logger.error(f"FFmpeg {label} failed: {stderr.decode()[:200]}")
        except FileNotFoundError:
            logger.warning("FFmpeg not installed �� skipping video transcoding")
            return {}
        except Exception:
            logger.exception(f"Transcoding {label} failed")

    return urls


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


async def _extract_subtitles(url: str) -> list[dict]:
    """Extract subtitles from YouTube/Bilibili using yt-dlp.

    Downloads English subtitles (manual or auto-generated), parses the VTT/SRT file,
    and returns a list of {start, end, text} dicts.
    """
    import yt_dlp

    loop = asyncio.get_event_loop()

    def _sync_extract():
        tmpdir = Path(tempfile.mkdtemp(prefix="speaking_subs_"))
        try:
            opts = {
                "quiet": True,
                "no_warnings": True,
                "writesubtitles": True,
                "writeautomaticsub": True,
                "subtitleslangs": ["en"],
                "skip_download": True,
                "outtmpl": str(tmpdir / "%(id)s.%(ext)s"),
            }

            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])

            sub_files = sorted(
                p for p in tmpdir.iterdir()
                if p.suffix.lower() in (".vtt", ".srt")
            )
            if not sub_files:
                return None

            return _parse_subtitle_file(sub_files[0])
        finally:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)

    return await loop.run_in_executor(None, _sync_extract)


def _parse_subtitle_file(path: Path) -> list[dict]:
    """Parse a VTT or SRT subtitle file into structured data."""
    content = path.read_text(encoding="utf-8")
    ext = path.suffix.lower()
    if ext == ".vtt":
        return _parse_webvtt(content)
    return _parse_srt(content)


def _parse_webvtt(content: str) -> list[dict]:
    """Parse WebVTT content into {start, end, text} dicts."""
    import re

    # Strip WEBVTT header and inline tags
    content = re.sub(r"^WEBVTT.*\n", "", content)

    pattern = re.compile(
        r"(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})[^\n]*\n"
        r"((?:.+\n?)+?)(?=\n\n|\n?\d+\n|\Z)",
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


@celery_app.task(bind=True, max_retries=2)
def transcribe_audio(self, audio_path: str) -> str:
    """Transcribe user audio via Whisper for speaking practice."""
    try:
        import whisper

        model = whisper.load_model("base")
        result = model.transcribe(audio_path, language="en")
        return result["text"].strip()
    except Exception as e:
        logger.exception("Whisper transcription failed")
        raise self.retry(exc=e)
