"""Subtitle re-segmentation helpers (cloud side).

The GPU transcription worker (``gpu-worker/``) owns the canonical
``whisperx_segments_to_subtitles`` / ``split_long_segments`` /
``merge_short_segments`` pipeline: it turns aligned ASR segments into the
sentence-level subtitle rows the callback persists.

The admin subtitle editor still needs the *same* split/merge semantics to
re-cut stored rows without re-running forced alignment (bulk re-segmentation).
After the GPU worker was split out of this repo the two sides no longer share a
module, so this file is a **cloud-side copy** of those pure, dependency-free
functions.

Keep in sync with ``gpu-worker/gpu_worker/transcription/formatters.py``:
- ``_SENTENCE_END`` / ``_CLAUSE_END``
- ``_build_subsegment`` / ``_split_words_by_boundary`` / ``_force_split_by_count``
- ``split_long_segments`` / ``merge_short_segments``
"""

_SENTENCE_END = ".?!"
_CLAUSE_END = ",;:"


def _build_subsegment(words: list[dict], seg_start: float, seg_end: float) -> dict | None:
    """Build a segment dict from a slice of words. Returns None if empty."""
    if not words:
        return None
    start = words[0].get("start", seg_start)
    end = words[-1].get("end", seg_end)
    # Rebuild text from word tokens with proper spacing.  The raw ASR text
    # may be concatenated (missing spaces), so always reconstruct from words.
    text = " ".join(w.get("word", "").strip() for w in words if w.get("word", "").strip())
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

    Tries, in order:
    1. sentence boundaries (``.?!``),
    2. clause boundaries (``,;:``) when a sentence still exceeds ``max_duration``,
    3. fixed word count when neither yields short enough pieces.

    Each output segment keeps the ``{"start","end","text","words"}`` shape with
    word timestamps scoped to the sub-segment. Segments without ``words`` (no
    word timestamps) are returned as-is — we can't reassign timestamps without
    them.
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


def merge_short_segments(
    segments: list[dict],
    min_duration: float = 1.0,
    max_words: int = 2,
) -> list[dict]:
    """Merge adjacent segments that are too short to stand alone.

    A segment is a merge candidate when its duration is below ``min_duration``
    AND it has at most ``max_words`` words. The fragment is folded into the
    preceding segment: text concatenated with a space, span widened to
    ``[prev.start, cur.end]``, word lists concatenated.

    The first segment is never merged away (no predecessor); a run of short
    segments after a normal one accumulates into it. Segments without word
    timestamps are judged by duration alone (``max_words`` skipped).
    """
    if len(segments) <= 1:
        return list(segments)
    out: list[dict] = []
    for seg in segments:
        words = seg.get("words", []) or []
        seg_start = seg.get("start", 0.0)
        seg_end = seg.get("end", seg_start)
        duration = seg_end - seg_start
        is_short = duration < min_duration and (len(words) <= max_words if words else True)
        if is_short and out:
            prev = out[-1]
            prev_words = prev.get("words", []) or []
            merged_words = prev_words + words
            prev["start"] = min(prev.get("start", seg_start), seg_start)
            prev["end"] = max(prev.get("end", seg_end), seg_end)
            prev["text"] = (prev.get("text", "") + " " + seg.get("text", "")).strip()
            if merged_words:
                prev["words"] = merged_words
        else:
            # Shallow copy so we don't mutate the caller's segment dicts when
            # later segments merge into this one.
            out.append(dict(seg))
    return out
