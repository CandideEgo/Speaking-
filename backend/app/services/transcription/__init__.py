"""Unified transcription service for Speaking app.

Replaces the existing yt-dlp-only subtitle extraction with a full
audio-transcription pipeline using faster-whisper.

Supports:
- YouTube (streaming audio extraction)
- Bilibili (streaming audio extraction)
- Douyin (Playwright direct extraction)
- Local video files (ffmpeg audio extraction)
- Any other URL yt-dlp can handle
"""

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from app.core.config import get_settings
from app.models.video import Platform

from .exceptions import TranscriptionError, AudioExtractionError, UnsupportedPlatformError
from .whisper_model import get_whisper_model
from .audio_extractor import (
    extract_streaming_audio,
    extract_local_audio,
    extract_douyin_audio,
    get_video_duration,
    _is_streaming_url,
)
from .chunked_transcription import transcribe_in_chunks, transcribe_local_chunks
from .formatters import whisper_segments_to_subtitles

logger = logging.getLogger(__name__)


class TranscriptionService:
    """Unified transcription service for all video platforms."""

    def __init__(self):
        self.settings = get_settings()

    async def transcribe(self, source: str, platform: Platform) -> list[dict]:
        """Transcribe a video into subtitles.

        Args:
            source: Video URL or local file path.
            platform: Platform enum value.

        Returns:
            list[dict]: [{"start": float, "end": float, "text": str}, ...]

        Raises:
            TranscriptionError: If transcription fails.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._sync_transcribe,
            source,
            platform,
        )

    def _sync_transcribe(self, source: str, platform: Platform) -> list[dict]:
        """Synchronous transcription core logic."""
        # Create temp directory for audio files
        temp_dir = Path(self.settings.transcription_temp_dir)
        temp_dir.mkdir(parents=True, exist_ok=True)

        audio_path = None
        try:
            # Step 1: Extract audio
            audio_path = self._extract_audio(source, platform, temp_dir)
            if not audio_path or not Path(audio_path).exists():
                raise TranscriptionError("Failed to extract audio from video")

            # Step 2: Get duration
            duration = get_video_duration(audio_path)
            logger.info(f"Audio duration: {duration:.1f}s")

            # Step 3: Transcribe
            if duration > self.settings.whisper_chunk_duration:
                logger.info(f"Video exceeds {self.settings.whisper_chunk_duration}s, using chunked transcription")
                # For chunked transcription we need async, but we're in sync context
                # Run chunked transcription via asyncio.run
                segments = self._transcribe_chunked_sync(audio_path, duration)
            else:
                segments = self._transcribe_single(audio_path)

            # Step 4: Convert to subtitle format
            subs = whisper_segments_to_subtitles(segments)
            logger.info(f"Transcription complete: {len(subs)} subtitles")
            return subs

        except TranscriptionError:
            raise
        except Exception as e:
            raise TranscriptionError(f"Transcription failed: {e}") from e
        finally:
            if audio_path and os.path.exists(audio_path):
                try:
                    os.remove(audio_path)
                except OSError:
                    pass

    def _extract_audio(self, source: str, platform: Platform, temp_dir: Path) -> str | None:
        """Extract audio based on platform type.

        Returns:
            Path to the extracted WAV file, or None on failure.
        """
        audio_path = str(temp_dir / f"audio_{abs(hash(source))}.wav")

        if platform == Platform.douyin:
            logger.info("Extracting Douyin audio via Playwright")
            extract_douyin_audio(source, audio_path)
            return audio_path

        if platform == Platform.local:
            logger.info(f"Extracting local audio: {source}")
            extract_local_audio(source, audio_path)
            return audio_path

        # YouTube, Bilibili, and other streaming URLs
        parsed = urlparse(source)
        if parsed.scheme in ("http", "https") and _is_streaming_url(source):
            logger.info(f"Extracting streaming audio: {source[:80]}...")
            extract_streaming_audio(source, audio_path)
            return audio_path

        # Fallback: try as local file
        if Path(source).exists():
            logger.info(f"Treating as local file: {source}")
            extract_local_audio(source, audio_path)
            return audio_path

        raise UnsupportedPlatformError(f"Cannot extract audio from: {source}")

    def _transcribe_single(self, audio_path: str) -> list:
        """Transcribe a single audio file."""
        logger.info(f"Transcribing audio: {audio_path}")
        model = get_whisper_model()
        segments, _ = model.transcribe(audio_path, language="en", beam_size=5)
        return list(segments)

    def _transcribe_chunked_sync(self, audio_path: str, duration: float) -> list:
        """Run chunked transcription synchronously.

        Since chunked transcription is async, we need to run it in a new event loop.
        """
        import asyncio

        async def _run():
            return await transcribe_local_chunks(audio_path, duration)

        try:
            return asyncio.run(_run())
        except RuntimeError:
            # If there's already a running event loop (e.g., in Celery)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(transcribe_local_chunks(audio_path, duration))
            finally:
                loop.close()


# Backwards-compatible alias for direct import
async def transcribe_video(source: str, platform: Platform) -> list[dict]:
    """Convenience function to transcribe a video.

    Args:
        source: Video URL or local file path.
        platform: Platform enum value.

    Returns:
        list[dict]: Subtitle dicts.
    """
    service = TranscriptionService()
    return await service.transcribe(source, platform)
