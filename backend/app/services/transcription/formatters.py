"""Format Whisper segments into Speaking-compatible subtitle dicts."""


def whisper_segments_to_subtitles(segments) -> list[dict]:
    """Convert faster-whisper segments to Speaking subtitle format.

    Args:
        segments: Iterator or list of faster-whisper Segment objects.

    Returns:
        list[dict]: [{"start": float, "end": float, "text": str}, ...]
    """
    results = []
    for seg in segments:
        text = seg.text.strip() if seg.text else ""
        if text:
            results.append({
                "start": float(seg.start),
                "end": float(seg.end),
                "text": text,
            })
    return results
