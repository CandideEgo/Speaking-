"""Forced alignment + objective metrics for speaking practice evaluation.

This module provides the acoustic analysis layer that the speaking
evaluation pipeline uses to produce word-level scores.  It wraps
whisperx forced alignment (wav2vec2) and computes objective metrics
from the alignment data.

The main entry point is ``evaluate_speaking_alignment()`` which returns
a dict with word_scores and acoustic metrics, or ``None`` on failure
(so the caller can fall back to text-only LLM scoring).
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

import structlog

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def evaluate_speaking_alignment(
    audio_path: str,
    transcript_segments: list[dict],
    original_text: str,
    audio_duration: float,
) -> dict | None:
    """Run forced alignment + compute metrics for a speaking attempt.

    Args:
        audio_path: Path to the audio file (webm / wav / mp3 …).
        transcript_segments: Segments from Whisper, each with ``"text"`` and
            optionally ``"words"`` (word-level detail from faster-whisper).
        original_text: The reference subtitle text the user was reading.
        audio_duration: Duration of the audio in seconds.

    Returns:
        Dict with keys:
        - ``word_scores``: list of ``{word, score (0-100), status}``
        - ``metrics``: dict of acoustic metrics
        - ``word_comparison``: detailed per-word alignment data
        Or ``None`` if alignment failed (caller should fall back).
    """
    try:
        aligned_words = _run_forced_alignment(audio_path, transcript_segments)
    except Exception:
        logger.warning("Forced alignment failed, falling back to text-only scoring")
        return None

    original_words = _normalize_words(original_text)
    metrics = _compute_metrics(original_words, aligned_words, audio_duration)
    word_scores = _build_word_scores(metrics["word_comparison"], metrics["avg_alignment_score"])

    return {
        "word_scores": word_scores,
        "metrics": {
            "speech_rate_wpm": metrics["speech_rate_wpm"],
            "pause_ratio": metrics["pause_ratio"],
            "word_hit_rate": metrics["word_hit_rate"],
            "avg_alignment_score": metrics["avg_alignment_score"],
        },
        "word_comparison": metrics["word_comparison"],
    }


# ---------------------------------------------------------------------------
# Forced alignment (calls whisperx)
# ---------------------------------------------------------------------------


def _run_forced_alignment(audio_path: str, segments: list[dict]) -> list[dict]:
    """Run whisperx forced alignment on the audio.

    Returns a list of word dicts, each with:
    ``{"word": str, "start": float, "end": float, "score": float}``
    where *score* is the wav2vec2 alignment confidence (0.0-1.0).
    """
    import whisperx

    from app.services.transcription.whisper_model import get_align_model

    # Load audio at 16kHz mono (whisperx handles format conversion via ffmpeg)
    audio = whisperx.load_audio(audio_path)

    # Build the segment format whisperx.align() expects
    align_segments = {"segments": []}
    for seg in segments:
        entry = {
            "start": seg.get("start", 0.0),
            "end": seg.get("end", 0.0),
            "text": seg.get("text", ""),
        }
        # If faster-whisper already produced word-level detail, include it
        if seg.get("words"):
            entry["words"] = seg["words"]
        align_segments["segments"].append(entry)

    # Load alignment model
    model_a, metadata = get_align_model("en")

    # Run alignment
    result = whisperx.align(
        align_segments,
        model_a,
        metadata,
        audio,
        "cpu",  # alignment is fast even on CPU for short clips
        return_char_alignments=False,
    )

    # Extract word-level data
    words = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            words.append(
                {
                    "word": w.get("word", "").strip(),
                    "start": w.get("start", 0.0),
                    "end": w.get("end", 0.0),
                    "score": w.get("score", 0.0) or 0.0,
                }
            )

    return words


# ---------------------------------------------------------------------------
# Metrics computation
# ---------------------------------------------------------------------------


def _normalize_words(text: str) -> list[str]:
    """Split text into lowercase words, stripping punctuation."""
    return re.findall(r"[a-zA-Z']+", text.lower())


def _compute_metrics(
    original_words: list[str],
    aligned_words: list[dict],
    audio_duration: float,
) -> dict:
    """Compute objective speaking metrics from alignment data.

    Returns:
        {
            "speech_rate_wpm": float,
            "pause_ratio": float,
            "word_hit_rate": float,
            "avg_alignment_score": float,
            "word_comparison": list[dict],
        }
    """
    # --- Speech rate ---
    num_spoken = len(aligned_words)
    speech_rate_wpm = (num_spoken / audio_duration * 60) if audio_duration > 0 else 0.0

    # --- Pause ratio (silence / total) ---
    if len(aligned_words) >= 2 and audio_duration > 0:
        total_silence = 0.0
        for i in range(1, len(aligned_words)):
            gap = aligned_words[i]["start"] - aligned_words[i - 1]["end"]
            if gap > 0:
                total_silence += gap
        pause_ratio = round(total_silence / audio_duration, 3)
    else:
        pause_ratio = 0.0

    # --- Average alignment confidence ---
    if aligned_words:
        avg_alignment_score = round(sum(w["score"] for w in aligned_words) / len(aligned_words), 3)
    else:
        avg_alignment_score = 0.0

    # --- Word-level comparison ---
    spoken_words = [w["word"].lower().strip() for w in aligned_words]
    word_comparison = _compare_words(original_words, spoken_words, aligned_words)

    # --- Word hit rate ---
    hit_count = sum(1 for wc in word_comparison if wc["status"] == "correct")
    word_hit_rate = round(hit_count / len(original_words), 3) if original_words else 0.0

    return {
        "speech_rate_wpm": round(speech_rate_wpm, 1),
        "pause_ratio": pause_ratio,
        "word_hit_rate": word_hit_rate,
        "avg_alignment_score": avg_alignment_score,
        "word_comparison": word_comparison,
    }


def _compare_words(
    original: list[str],
    spoken: list[str],
    aligned_words: list[dict],
) -> list[dict]:
    """Align original vs spoken words using sequence matching.

    Returns a list of comparison dicts:
        {"original": str, "spoken": str|None, "status": str, "alignment_score": float}

    Status values: correct, partial, missing, extra.
    """
    matcher = SequenceMatcher(None, original, spoken)
    comparison = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k, orig_word in enumerate(original[i1:i2]):
                spoken_idx = j1 + k
                score = aligned_words[spoken_idx]["score"] if spoken_idx < len(aligned_words) else 0.0
                comparison.append(
                    {
                        "original": orig_word,
                        "spoken": spoken[spoken_idx],
                        "status": "correct",
                        "alignment_score": round(score, 3),
                    }
                )
        elif tag == "replace":
            # Pair up what we can; remaining original words are "missing",
            # remaining spoken words are "extra"
            orig_slice = original[i1:i2]
            spoken_slice = spoken[j1:j2]
            pairs = min(len(orig_slice), len(spoken_slice))
            for k in range(pairs):
                spoken_idx = j1 + k
                score = aligned_words[spoken_idx]["score"] if spoken_idx < len(aligned_words) else 0.0
                # Check if it's a close match (partial)
                status = "partial" if _is_partial_match(orig_slice[k], spoken_slice[k]) else "missing"
                comparison.append(
                    {
                        "original": orig_slice[k],
                        "spoken": spoken_slice[k],
                        "status": status,
                        "alignment_score": round(score, 3),
                    }
                )
            # Remaining original words with no spoken counterpart
            for k in range(pairs, len(orig_slice)):
                comparison.append(
                    {
                        "original": orig_slice[k],
                        "spoken": None,
                        "status": "missing",
                        "alignment_score": 0.0,
                    }
                )
            # Remaining spoken words with no original counterpart
            for k in range(pairs, len(spoken_slice)):
                spoken_idx = j1 + k
                score = aligned_words[spoken_idx]["score"] if spoken_idx < len(aligned_words) else 0.0
                comparison.append(
                    {
                        "original": "",
                        "spoken": spoken_slice[k],
                        "status": "extra",
                        "alignment_score": round(score, 3),
                    }
                )
        elif tag == "delete":
            for orig_word in original[i1:i2]:
                comparison.append(
                    {
                        "original": orig_word,
                        "spoken": None,
                        "status": "missing",
                        "alignment_score": 0.0,
                    }
                )
        elif tag == "insert":
            for k, spoken_word in enumerate(spoken[j1:j2]):
                spoken_idx = j1 + k
                score = aligned_words[spoken_idx]["score"] if spoken_idx < len(aligned_words) else 0.0
                comparison.append(
                    {
                        "original": "",
                        "spoken": spoken_word,
                        "status": "extra",
                        "alignment_score": round(score, 3),
                    }
                )

    return comparison


def _is_partial_match(original: str, spoken: str) -> bool:
    """Check if two words are a close but not exact match.

    Uses a simple heuristic: edit distance ≤ 2 for words ≤ 5 chars,
    or ratio ≥ 0.6 for longer words.
    """
    if not original or not spoken:
        return False
    if original == spoken:
        return True

    # Short words: allow 1-2 character differences
    if len(original) <= 5 and len(spoken) <= 5:
        dist = _edit_distance(original, spoken)
        return dist <= 2

    # Longer words: use similarity ratio
    ratio = SequenceMatcher(None, original, spoken).ratio()
    return ratio >= 0.6


def _edit_distance(a: str, b: str) -> int:
    """Compute Levenshtein edit distance between two strings."""
    if len(a) < len(b):
        return _edit_distance(b, a)
    if not b:
        return len(a)

    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            curr.append(prev[j] if ca == cb else 1 + min(prev[j], prev[j + 1], curr[j]))
        prev = curr
    return prev[-1]


# ---------------------------------------------------------------------------
# Build API response format
# ---------------------------------------------------------------------------


def _build_word_scores(
    word_comparison: list[dict],
    avg_alignment_score: float,
) -> list[dict]:
    """Convert word comparison to the API response format.

    Returns:
        [{"word": str, "score": int (0-100), "status": "correct"|"partial"|"missing"|"extra"}]
    """
    scores = []
    for wc in word_comparison:
        status = wc["status"]
        alignment = wc.get("alignment_score", 0.0)

        if status == "correct":
            base = 90 + int(alignment * 10)  # 90-100, modulated by alignment confidence
        elif status == "partial":
            base = 50 + int(alignment * 25)  # 50-75
        elif status == "missing":
            base = 0
        elif status == "extra":
            base = 0
        else:
            base = 0

        scores.append(
            {
                "word": wc.get("original") or wc.get("spoken", ""),
                "score": min(100, max(0, base)),
                "status": status,
            }
        )

    return scores
