"""Format Whisper segments into Speaking-compatible subtitle dicts.

Formatters provided:
- whisperx_segments_to_subtitles(): Subtitle dicts from segment dicts (works for
  both WhisperX aligned output and faster-whisper fallback output). Uses
  word-level timestamps when present, else segment start/end.
- faster_whisper_segments_to_dicts(): Raw faster-whisper Segment objects →
  segment dicts (shared by the fallback transcriber and speaking_service).
- whisper_segments_to_subtitles(): Legacy, raw faster-whisper Segment objects
  → subtitle dicts without word-level timestamps (used by speaking_service).
"""

import structlog

logger = structlog.get_logger()


def faster_whisper_segments_to_dicts(segments) -> list[dict]:
    """Convert raw faster-whisper ``Segment`` objects to segment dicts.

    Shared by the faster-whisper fallback transcriber and the speaking-practice
    path so both emit one shape. Each segment:
    ``{"start": float, "end": float, "text": str, "words": [...]}`` where each
    word is ``{"word": str, "start": float, "end": float, "score": float}``.
    ``score`` is the word probability (0.0-1.0), matching the ``whisperx.align()``
    convention so downstream consumers (e.g. speaking_alignment) see one key.
    ``words`` is empty when word timestamps are unavailable.
    """
    out = []
    for seg in segments:
        words = [
            {
                "word": w.word.strip(),
                "start": float(w.start),
                "end": float(w.end),
                "score": float(getattr(w, "probability", 0.0)),
            }
            for w in (getattr(seg, "words", None) or [])
        ]
        out.append(
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": (seg.text or "").strip(),
                "words": words,
            }
        )
    return out


def whisperx_segments_to_subtitles(segments: list[dict], offset: float = 0.0) -> list[dict]:
    """Convert segment dicts to Speaking subtitle format.

    Accepts segment dicts from either engine:
    - WhisperX aligned output (sentence-segmented via punctuation restoration +
      NLTK Punkt inside ``whisperx.align()``, with precise word-level timestamps).
    - faster-whisper fallback output (segment-level; words optional).

    Word-level timestamps are used to tighten subtitle boundaries when present;
    otherwise the segment's own start/end are used.

    Args:
        segments: List of segment dicts.
            Each: {"start": float, "end": float, "text": str, "words": [...]}
            (``words`` optional; sentence-splitting only guaranteed for aligned input.)
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

        results.append(
            {
                "start": float(start),
                "end": float(end),
                "text": text,
            }
        )
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
            results.append(
                {
                    "start": float(start + offset),
                    "end": float(end + offset),
                    "text": text,
                }
            )
    return results
