"""Format Whisper segments into Speaking-compatible subtitle dicts.

Two formatters are provided:
- whisperx_segments_to_subtitles(): For WhisperX aligned output (sentence-segmented
  via punctuation restoration + NLTK Punkt, with word-level timestamps).
- whisper_segments_to_subtitles(): Legacy fallback for raw faster-whisper segments
  (used when WhisperX is unavailable, e.g. in speaking_service).
"""

import logging

logger = logging.getLogger(__name__)


def whisperx_segments_to_subtitles(
    segments: list[dict], offset: float = 0.0
) -> list[dict]:
    """Convert WhisperX aligned segments to Speaking subtitle format.

    Segments should already be sentence-segmented (via punctuation restoration
    + NLTK Punkt inside whisperx.align()). Each segment has precise word-level
    timestamps from wav2vec2 forced alignment.

    Args:
        segments: List of dicts from whisperx.align()["segments"].
            Each: {"start": float, "end": float, "text": str, "words": [...]}
        offset: Time offset in seconds (for chunked transcription).

    Returns:
        list[dict]: [{"start": float, "end": float, "text": str}, ...]
    """
    results = []
    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue

        # Use word-level timestamps when available (more precise than segment-level)
        words = seg.get("words", [])
        if words:
            start = words[0].get("start", seg.get("start", 0.0)) + offset
            end = words[-1].get("end", seg.get("end", 0.0)) + offset
        else:
            start = seg.get("start", 0.0) + offset
            end = seg.get("end", 0.0) + offset

        results.append({
            "start": float(start),
            "end": float(end),
            "text": text,
        })
    return results


def whisper_segments_to_subtitles(segments, offset: float = 0.0) -> list[dict]:
    """Convert raw faster-whisper segments to Speaking subtitle format.

    Legacy fallback used when WhisperX is unavailable (e.g. speaking_service
    uses raw faster-whisper for short user audio clips).

    Args:
        segments: Iterator or list of faster-whisper Segment objects.
        offset: Time offset in seconds (for chunked transcription).

    Returns:
        list[dict]: [{"start": float, "end": float, "text": str}, ...]
    """
    results = []
    for seg in segments:
        # Handle both Segment objects and dicts
        if isinstance(seg, dict):
            text = seg.get("text", "").strip()
            start = seg.get("start", 0)
            end = seg.get("end", 0)
        else:
            text = seg.text.strip() if seg.text else ""
            start = seg.start
            end = seg.end
        if text:
            results.append({
                "start": float(start + offset),
                "end": float(end + offset),
                "text": text,
            })
    return results
