"""Unified transcription service for Speaking app.

Uses WhisperX for high-quality transcription with:
- VAD preprocessing (pyannote/silero) to reduce hallucination
- Batched inference for faster transcription
- wav2vec2 forced alignment for precise word-level timestamps
- NLTK Punkt sentence segmentation

Supports:
- YouTube (streaming audio extraction)
- Bilibili (streaming audio extraction)
- Douyin (Playwright direct extraction)
- Local video files (ffmpeg audio extraction)
- Any other URL yt-dlp can handle
"""

import asyncio
import structlog
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from app.core.config import get_settings
from app.models.video import Platform

from .exceptions import TranscriptionError, AudioExtractionError, UnsupportedPlatformError
from .whisper_model import get_whisperx_model, get_align_model, _detect_device
from .audio_extractor import (
    extract_streaming_audio,
    extract_local_audio,
    extract_douyin_audio,
    get_video_duration,
    _is_streaming_url,
)
from .chunked_transcription import transcribe_in_chunks, transcribe_local_chunks
from .formatters import whisperx_segments_to_subtitles

logger = structlog.get_logger()


class TranscriptionService:
    """Unified transcription service for all video platforms."""

    def __init__(self):
        self.settings = get_settings()
        self._last_douyin_metadata: dict | None = None

    def get_last_douyin_metadata(self) -> dict | None:
        """Return metadata from the last Douyin extraction, if any."""
        return self._last_douyin_metadata

    def clear_douyin_metadata(self) -> None:
        """Clear cached Douyin metadata."""
        self._last_douyin_metadata = None

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
        """Synchronous transcription core logic using WhisperX."""
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
            logger.info("Audio duration", duration=f"{duration:.1f}s")

            # Step 3: Transcribe + align with WhisperX
            if duration > self.settings.whisper_chunk_duration:
                logger.info(
                    "Video exceeds chunk duration, using chunked transcription",
                    chunk_duration=self.settings.whisper_chunk_duration,
                )
                subs = self._transcribe_chunked_sync(audio_path, duration)
            else:
                subs = self._transcribe_single(audio_path)

            logger.info("Transcription complete", subtitle_count=len(subs))
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
            logger.info("Extracting Douyin audio via advanced Playwright")
            metadata = extract_douyin_audio(source, audio_path)
            self._last_douyin_metadata = metadata
            return audio_path

        if platform == Platform.local:
            logger.info("Extracting local audio", source=source)
            extract_local_audio(source, audio_path)
            return audio_path

        # YouTube, Bilibili, and other streaming URLs
        parsed = urlparse(source)
        if parsed.scheme in ("http", "https") and _is_streaming_url(source):
            logger.info("Extracting streaming audio", source=source[:80])
            extract_streaming_audio(source, audio_path)
            return audio_path

        # Fallback: try as local file
        if Path(source).exists():
            logger.info("Treating as local file", source=source)
            extract_local_audio(source, audio_path)
            return audio_path

        raise UnsupportedPlatformError(f"Cannot extract audio from: {source}")

    def _transcribe_single(self, audio_path: str) -> list[dict]:
        """Transcribe a single audio file with WhisperX (ASR + alignment).

        Pipeline: ASR → punctuation restoration → forced alignment → format.
        Punctuation restoration ensures NLTK Punkt inside align() can
        correctly split segments into sentences.

        Returns:
            list[dict]: Subtitle dicts with sentence-level segmentation.
        """
        import whisperx

        logger.info("Transcribing audio with WhisperX", audio_path=audio_path)

        # Load audio as numpy array (required by WhisperX)
        audio = whisperx.load_audio(audio_path)

        # Step 1: ASR with VAD + batched inference
        model = get_whisperx_model()
        result = model.transcribe(
            audio,
            batch_size=self.settings.whisperx_batch_size,
        )
        language = result.get("language", "en")
        logger.info("WhisperX ASR complete", language=language, segment_count=len(result['segments']))

        # Step 2: Restore punctuation (so align()'s NLTK Punkt can split sentences)
        from .punctuation import restore_punctuation
        result["segments"] = restore_punctuation(result["segments"])
        logger.info("Punctuation restored", segment_count=len(result['segments']))

        # Step 3: Forced alignment for word-level timestamps + sentence segmentation
        model_a, metadata = get_align_model(language)
        device, _ = _detect_device()
        result = whisperx.align(
            result["segments"], model_a, metadata, audio, device
        )
        logger.info("WhisperX aligned", segment_count=len(result['segments']))

        # Step 4: Convert to subtitle format
        return whisperx_segments_to_subtitles(result["segments"])

    def _transcribe_chunked_sync(self, audio_path: str, duration: float) -> list[dict]:
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
