"""Transcription quality checks — detect hallucinations and anomalies in
WhisperX output before persisting subtitles.

Hallucination patterns:
- Repetitive text (same phrase repeated many times)
- Nonsense / non-linguistic characters
- Duration mismatch (subtitle span >> audio duration)
- Empty or whitespace-only segments
- Excessive segment count for audio duration
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

import structlog

logger = structlog.get_logger()

# Thresholds (tunable via settings if needed)
_MAX_REPEAT_RATIO = 0.3  # >30% of segments are the same text → hallucination
_MIN_SEGMENT_DURATION = 0.5  # seconds; shorter may be noise
_MAX_SEGMENT_DURATION = 60.0  # seconds; longer may be under-segmented
_MAX_CHARS_PER_SECOND = 40  # >40 chars/second is likely nonsense or song lyrics
_MIN_TEXT_LENGTH = 2  # ignore segments with < 2 chars (noise)
_MAX_EMPTY_RATIO = 0.5  # >50% empty segments → suspicious


@dataclass(frozen=True)
class HallucinationCheck:
    """Result of a single check."""

    name: str
    passed: bool
    detail: str | None = None


@dataclass
class QualityReport:
    """Aggregated quality report for a transcription batch."""

    passed: bool  # True if all critical checks passed
    checks: list[HallucinationCheck]
    warnings: list[str]  # non-critical issues
    segment_count: int
    audio_duration: float | None

    @property
    def has_critical_issue(self) -> bool:
        """True if any check failed."""
        return not self.passed

    @property
    def failed_checks(self) -> list[HallucinationCheck]:
        return [c for c in self.checks if not c.passed]


def _is_repetitive(segments: list[dict]) -> HallucinationCheck:
    """Detect if the same text dominates the transcript (repetition hallucination)."""
    texts = [s.get("text", "").strip().lower() for s in segments if s.get("text", "").strip()]
    if not texts:
        return HallucinationCheck("repetitive", False, "All segments empty")

    most_common, count = Counter(texts).most_common(1)[0]
    ratio = count / len(texts)
    if ratio > _MAX_REPEAT_RATIO and len(texts) > 5:
        return HallucinationCheck(
            "repetitive",
            False,
            f"'{most_common[:40]}' repeats {count}/{len(texts)} ({ratio:.0%})",
        )
    return HallucinationCheck("repetitive", True)


def _has_nonsense(segments: list[dict]) -> HallucinationCheck:
    """Detect segments with excessive non-linguistic characters."""
    nonsense_count = 0
    for seg in segments:
        text = seg.get("text", "")
        if not text:
            continue
        # Count non-alphanumeric, non-punctuation, non-whitespace chars
        weird = len(re.findall(r"[^\w\s\-'\".,!?;:]", text))
        if weird / max(len(text), 1) > 0.5:
            nonsense_count += 1

    ratio = nonsense_count / max(len(segments), 1)
    if ratio > 0.3:
        return HallucinationCheck(
            "nonsense",
            False,
            f"{nonsense_count}/{len(segments)} segments have >50% non-linguistic chars",
        )
    return HallucinationCheck("nonsense", True)


def _duration_sanity(segments: list[dict], audio_duration: float | None) -> HallucinationCheck:
    """Check that subtitle timeline fits within audio duration."""
    if not segments:
        return HallucinationCheck("duration", False, "No segments")

    if audio_duration and audio_duration > 0:
        last_end = max(s.get("end", 0) for s in segments)
        if last_end > audio_duration * 1.5:
            return HallucinationCheck(
                "duration",
                False,
                f"Last subtitle ends at {last_end:.1f}s, audio is {audio_duration:.1f}s",
            )

    # Check individual segment durations
    bad_durations = 0
    for seg in segments:
        dur = seg.get("end", 0) - seg.get("start", 0)
        if dur < _MIN_SEGMENT_DURATION or dur > _MAX_SEGMENT_DURATION:
            bad_durations += 1

    ratio = bad_durations / max(len(segments), 1)
    if ratio > 0.5:
        return HallucinationCheck(
            "duration",
            False,
            f"{bad_durations}/{len(segments)} segments have abnormal duration",
        )
    return HallucinationCheck("duration", True)


def _density_check(segments: list[dict]) -> HallucinationCheck:
    """Detect impossibly dense text (likely hallucination or song lyrics)."""
    dense = 0
    for seg in segments:
        text = seg.get("text", "")
        dur = seg.get("end", 0) - seg.get("start", 0)
        if dur > 0 and len(text) / dur > _MAX_CHARS_PER_SECOND:
            dense += 1

    ratio = dense / max(len(segments), 1)
    if ratio > 0.3:
        return HallucinationCheck(
            "density",
            False,
            f"{dense}/{len(segments)} segments exceed {_MAX_CHARS_PER_SECOND} chars/sec",
        )
    return HallucinationCheck("density", True)


def _empty_ratio(segments: list[dict]) -> HallucinationCheck:
    """Check for too many empty/whitespace-only segments."""
    empty = sum(1 for s in segments if not s.get("text", "").strip())
    ratio = empty / max(len(segments), 1)
    if ratio > _MAX_EMPTY_RATIO and len(segments) > 5:
        return HallucinationCheck(
            "empty_ratio",
            False,
            f"{empty}/{len(segments)} segments are empty ({ratio:.0%})",
        )
    return HallucinationCheck("empty_ratio", True)


def check_transcription_quality(
    segments: list[dict],
    audio_duration: float | None = None,
) -> QualityReport:
    """Run all quality checks on transcription segments.

    Args:
        segments: List of dicts with ``text``, ``start``, ``end`` keys.
        audio_duration: Audio duration in seconds (from ffprobe).

    Returns:
        QualityReport with ``passed=True`` if no critical issues detected.
    """
    checks = [
        _is_repetitive(segments),
        _has_nonsense(segments),
        _duration_sanity(segments, audio_duration),
        _density_check(segments),
        _empty_ratio(segments),
    ]

    warnings: list[str] = []
    if len(segments) < 3 and audio_duration and audio_duration > 30:
        warnings.append(f"Only {len(segments)} segments for {audio_duration:.0f}s audio")

    passed = all(c.passed for c in checks)
    return QualityReport(
        passed=passed,
        checks=checks,
        warnings=warnings,
        segment_count=len(segments),
        audio_duration=audio_duration,
    )


def log_quality_report(video_id: str, report: QualityReport) -> None:
    """Log a quality report at the appropriate level."""
    if report.has_critical_issue:
        logger.warning(
            "Transcription quality check FAILED",
            video_id=video_id,
            failed=[c.name for c in report.failed_checks],
            details=[c.detail for c in report.failed_checks],
            warnings=report.warnings,
            segments=report.segment_count,
        )
    else:
        logger.info(
            "Transcription quality check passed",
            video_id=video_id,
            segments=report.segment_count,
            warnings=report.warnings or None,
        )
