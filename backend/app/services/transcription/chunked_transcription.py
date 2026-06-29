"""Chunked transcription for long videos (> 10 minutes).

Splits long audio into chunks, transcribes each chunk with WhisperX
(ASR + forced alignment), and merges results with corrected timestamps.
"""

import asyncio
import os
import subprocess
from collections.abc import Callable
from pathlib import Path

import structlog

from app.core.config import get_settings

from .exceptions import AudioExtractionError
from .formatters import whisperx_segments_to_subtitles

logger = structlog.get_logger()

# Shared ffmpeg audio encoding flags
_FFMPEG_WAV_ARGS = ["-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1"]

# Windows no-window flag
_NO_WINDOW = 0
if hasattr(subprocess, "CREATE_NO_WINDOW"):
    _NO_WINDOW = subprocess.CREATE_NO_WINDOW


def _get_ffmpeg_path() -> str:
    import shutil

    found = shutil.which("ffmpeg")
    return found or "ffmpeg"


def _format_time(seconds: float) -> str:
    """Format seconds as HH:MM:SS."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


async def transcribe_in_chunks(
    total_duration: float,
    cache_key: str,
    extract_audio: Callable[[float, float, str], None],
    chunk_dir: Path | None = None,
) -> list[dict]:
    """Unified chunked transcription: extract audio in chunks, transcribe, merge.

    Args:
        total_duration: Total video duration in seconds.
        cache_key: Unique string for chunk filename disambiguation.
        extract_audio: Sync callable (offset, duration, output_path) -> None.
        chunk_dir: Directory for temporary chunk files.

    Returns:
        list[dict]: Subtitle dicts with corrected timestamps.
    """
    settings = get_settings()
    chunk_duration = settings.whisper_chunk_duration
    max_concurrent = settings.whisper_max_concurrent_chunks

    if chunk_dir is None:
        chunk_dir = Path(settings.transcription_temp_dir)
    chunk_dir.mkdir(parents=True, exist_ok=True)

    all_segments = []
    offset = 0.0
    total_chunks = int(total_duration / chunk_duration) + 1
    chunk_num = 0

    semaphore = asyncio.Semaphore(max_concurrent)
    loop = asyncio.get_running_loop()

    logger.info("Chunked transcription starting", total_chunks=total_chunks, total_duration=f"{total_duration:.0f}s")

    while offset < total_duration:
        chunk_num += 1
        remaining = total_duration - offset
        current_chunk_duration = min(chunk_duration, remaining)
        chunk_path = str(chunk_dir / f"chunk_{abs(hash(cache_key))}_{offset:.0f}.wav")

        logger.info(
            "Processing chunk",
            chunk=chunk_num,
            total_chunks=total_chunks,
            start=_format_time(offset),
            end=_format_time(offset + current_chunk_duration),
        )

        try:
            # Extract audio chunk
            await loop.run_in_executor(None, extract_audio, offset, current_chunk_duration, chunk_path)

            # Transcribe with WhisperX (ASR + alignment) with concurrency limit
            async with semaphore:
                segments = await loop.run_in_executor(None, _transcribe_single_chunk, chunk_path)

            # Convert to subtitles with offset — offset is passed directly
            # into the formatter so word-level timestamps are correctly shifted
            subs = whisperx_segments_to_subtitles(segments, offset=offset)
            all_segments.extend(subs)

            logger.info("Chunk complete", chunk=chunk_num, total_chunks=total_chunks, segment_count=len(subs))

        finally:
            if os.path.exists(chunk_path):
                os.remove(chunk_path)

        offset += current_chunk_duration

    logger.info("Chunked transcription complete", total_segments=len(all_segments))
    return all_segments


def _transcribe_single_chunk(audio_path: str) -> list[dict]:
    """Transcribe + align a single audio chunk.

    Dispatches to the configured engine (WhisperX by default, with automatic
    faster-whisper fallback on WhisperX failure).

    Returns:
        list[dict]: Aligned/segmented dicts.
            Each: {"start": float, "end": float, "text": str, "words": [...]}
    """
    from .whisper_model import _clear_cuda_cache, transcribe_audio

    try:
        return transcribe_audio(audio_path)
    finally:
        # Defragment between chunks so the resident singleton model can still
        # get a contiguous batch block on the next chunk. No-op on CPU. Runs in
        # the executor thread (same CUDA context as the transcription above).
        _clear_cuda_cache()


async def transcribe_local_chunks(audio_path: str, total_duration: float) -> list[dict]:
    """Split a local WAV file into chunks and transcribe each.

    Args:
        audio_path: Path to the local WAV file.
        total_duration: Total duration in seconds.

    Returns:
        list[dict]: Subtitle dicts with corrected timestamps.
    """
    settings = get_settings()
    chunk_duration = settings.whisper_chunk_duration
    max_concurrent = settings.whisper_max_concurrent_chunks

    chunk_dir = Path(settings.transcription_temp_dir)
    chunk_dir.mkdir(parents=True, exist_ok=True)

    total_chunks = int(total_duration / chunk_duration) + 1
    all_segments = []
    offset = 0.0
    loop = asyncio.get_running_loop()
    semaphore = asyncio.Semaphore(max_concurrent)

    logger.info("Local chunked starting", total_chunks=total_chunks, total_duration=f"{total_duration:.0f}s")

    for chunk_num in range(1, total_chunks + 1):
        remaining = total_duration - offset
        current_chunk_duration = min(chunk_duration, remaining)
        chunk_path = str(chunk_dir / f"localchunk_{abs(hash(audio_path))}_{offset:.0f}.wav")

        logger.info(
            "Processing chunk",
            chunk=chunk_num,
            total_chunks=total_chunks,
            start=_format_time(offset),
            end=_format_time(offset + current_chunk_duration),
        )

        # Extract segment from local file
        ffmpeg_cmd = [
            _get_ffmpeg_path(),
            "-y",
            "-ss",
            str(offset),
            "-i",
            audio_path,
            "-t",
            str(current_chunk_duration),
            *_FFMPEG_WAV_ARGS,
            chunk_path,
        ]
        result = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            timeout=120,
            creationflags=_NO_WINDOW,
        )
        if result.returncode != 0:
            raise AudioExtractionError(
                f"Local chunk extraction failed at offset {offset:.0f}s\nstderr: {result.stderr[:300]}"
            )

        try:
            async with semaphore:
                segments = await loop.run_in_executor(None, _transcribe_single_chunk, chunk_path)

            # Pass offset directly to formatter — word timestamps are correctly shifted
            subs = whisperx_segments_to_subtitles(segments, offset=offset)
            all_segments.extend(subs)

            logger.info("Chunk complete", chunk=chunk_num, total_chunks=total_chunks, segment_count=len(subs))

        finally:
            if os.path.exists(chunk_path):
                os.remove(chunk_path)

        offset += current_chunk_duration

    logger.info("Local chunked complete", total_segments=len(all_segments))
    return all_segments
