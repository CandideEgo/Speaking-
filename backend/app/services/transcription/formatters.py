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


# Sentence-ending and clause-ending punctuation for the fallback splitter below.
_SENTENCE_END = ".?!"
_CLAUSE_END = ",;:"


def _build_subsegment(words: list[dict], seg_start: float, seg_end: float) -> dict | None:
    """Build a segment dict from a slice of words. Returns None if empty."""
    if not words:
        return None
    start = words[0].get("start", seg_start)
    end = words[-1].get("end", seg_end)
    text = "".join(w.get("word", "") for w in words).strip()
    if not text:
        return None
    return {"start": float(start), "end": float(end), "text": text, "words": words}


def _split_words_by_boundary(words: list[dict], end_chars: str) -> list[list[dict]]:
    """Split a word list into groups, breaking after words ending with any of ``end_chars``."""
    if not words:
        return []
    groups: list[list[dict]] = []
    cur: list[dict] = []
    for w in words:
        cur.append(w)
        token = w.get("word", "").rstrip()
        if token and token[-1] in end_chars:
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    return groups


def _force_split_by_count(words: list[dict], max_words: int) -> list[list[dict]]:
    """Split a word list into chunks of at most ``max_words`` items."""
    return [words[i : i + max_words] for i in range(0, len(words), max_words)] or [words]


def split_long_segments(segments: list[dict], max_duration: float = 12.0) -> list[dict]:
    """Split overly long segment dicts into shorter sub-segments.

    Used by the faster-whisper fallback path (which skips ``whisperx.align`` and
    so can emit ~30s Whisper window segments). Tries, in order:
    1. sentence boundaries (``.?!``),
    2. clause boundaries (``,;:``) when a sentence still exceeds ``max_duration``,
    3. fixed word count when neither yields short enough pieces.

    Each output segment keeps the ``{"start","end","text","words"}`` shape with
    word timestamps scoped to the sub-segment, so downstream
    :func:`whisperx_segments_to_subtitles` works unchanged. Segments without
    ``words`` (no word timestamps) are returned as-is — we can't reassign
    timestamps without them.

    Args:
        segments: List of segment dicts.
        max_duration: Target maximum sub-segment duration in seconds.

    Returns:
        list[dict]: Segments, with any over-long ones split.
    """
    if max_duration <= 0:
        return list(segments)
    out: list[dict] = []
    for seg in segments:
        words = seg.get("words", []) or []
        seg_start = seg.get("start", 0.0)
        seg_end = seg.get("end", seg_start)
        seg_duration = seg_end - seg_start

        # Nothing to split: short enough, or no word timestamps to reassign.
        if seg_duration <= max_duration or not words:
            out.append(seg)
            continue

        # 1) sentence boundaries
        groups = _split_words_by_boundary(words, _SENTENCE_END)
        # 2) any group still too long -> clause boundaries
        refined: list[list[dict]] = []
        for g in groups:
            g_end = g[-1].get("end", seg_end) if g else seg_end
            g_start = g[0].get("start", seg_start) if g else seg_start
            if g_end - g_start <= max_duration:
                refined.append(g)
                continue
            clauses = _split_words_by_boundary(g, _CLAUSE_END)
            for c in clauses:
                refined.append(c)
        # 3) any group still too long -> force split by word count
        #    Use ~2s worth of words as the cap (rough heuristic).
        final: list[list[dict]] = []
        for g in refined:
            g_end = g[-1].get("end", seg_end) if g else seg_end
            g_start = g[0].get("start", seg_start) if g else seg_start
            if g_end - g_start <= max_duration or len(g) <= 1:
                final.append(g)
                continue
            # target word count proportional to the segment's share of max_duration
            ratio = max_duration / max(g_end - g_start, 0.1)
            cap = max(2, int(len(g) * ratio))
            final.extend(_force_split_by_count(g, cap))

        for g in final:
            sub = _build_subsegment(g, seg_start, seg_end)
            if sub:
                out.append(sub)
    return out


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
