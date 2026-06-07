import logging
import re
import tempfile
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


@celery_app.task(bind=True, max_retries=3)
def process_video(self, video_id: str):
    """Full pipeline for non-YouTube: download, transcode, subtitles, translate."""
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

                    # Step 1: save English subtitles immediately
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

                    # Step 2: translate
                    translated = await _translate_subtitles(texts)
                    for i, t in enumerate(translated):
                        if t:
                            result_sub = await db.execute(
                                select(Subtitle).where(
                                    Subtitle.video_id == video.id,
                                    Subtitle.sentence_index == i,
                                )
                            )
                            sub_row = result_sub.scalar_one_or_none()
                            if sub_row:
                                sub_row.text_zh = t

                # Download + transcode for non-YouTube
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

    try:
        asyncio.run(_process())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_process())
        finally:
            loop.close()


@celery_app.task(bind=True, max_retries=3)
def process_video_lightweight(self, video_id: str):
    """YouTube pipeline: extract metadata + subtitles + translate (no video download).

    Two-step for fast UX:
      1. Save English subtitles → status "ready_subtitles" (user sees English immediately)
      2. AI translate → status "ready" (Chinese appears progressively)
    """
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

                # --- Step 1: save English subtitles, mark ready_subtitles ---
                for i, sub in enumerate(subs):
                    db.add(Subtitle(
                        video_id=video.id,
                        start_time=sub["start"],
                        end_time=sub["end"],
                        text_en=sub["text"],
                        sentence_index=i,
                    ))
                video.processing_mode = "lightweight"
                video.status = VideoStatus.ready_subtitles
                await db.commit()
                logger.info(f"Video {video_id} step 1: {len(subs)} English subtitles saved")

                # --- Step 2: AI translate, update subtitles ---
                translated = await _translate_subtitles(texts)
                for i, t in enumerate(translated):
                    if t:
                        result_sub = await db.execute(
                            select(Subtitle).where(
                                Subtitle.video_id == video.id,
                                Subtitle.sentence_index == i,
                            )
                        )
                        sub_row = result_sub.scalar_one_or_none()
                        if sub_row:
                            sub_row.text_zh = t

                video.status = VideoStatus.ready
                await db.commit()
                logger.info(f"Video {video_id} step 2: translations done, ready")

            except Exception as e:
                logger.exception(f"Video {video_id} lightweight processing failed")
                video.status = VideoStatus.error
                video.error_message = str(e)
                await db.commit()
                raise self.retry(exc=e)

    try:
        asyncio.run(_process())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_process())
        finally:
            loop.close()


async def _extract_video_info(url: str) -> dict | None:
    """Extract video metadata (title, thumbnail, duration) via yt-dlp without downloading."""
    import yt_dlp
    from app.core.config import get_settings

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
    from app.core.config import get_settings

    settings = get_settings()
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
                "subtitlesformat": "json3",
                "skip_download": True,
                "outtmpl": str(tmpdir / "%(id)s.%(ext)s"),
            }
            if settings.http_proxy:
                opts["proxy"] = settings.http_proxy
            if settings.youtube_cookies_path:
                opts["cookiefile"] = settings.youtube_cookies_path
            opts["remote_components"] = "ejs:github"

            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])

            # Prefer JSON3 (clean word-by-word without overlap), fall back to VTT/SRT
            json3_files = sorted(
                p for p in tmpdir.iterdir()
                if p.suffix.lower() == ".json3"
            )
            if json3_files:
                return _parse_json3(json3_files[0])

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


@celery_app.task(bind=True, max_retries=2)
def transcribe_audio(self, audio_path: str) -> str:
    """Transcribe user audio via Whisper for speaking practice."""
    try:
        from app.services.speaking_service import _get_whisper_model
        model = _get_whisper_model()
        segments, _ = model.transcribe(audio_path, language="en")
        return " ".join([s.text for s in segments]).strip()
    except Exception as e:
        logger.exception("Whisper transcription failed")
        raise self.retry(exc=e)
