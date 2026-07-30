"""Translation quality gate for the video pipeline tail.

Runs after translation to detect common quality issues:
- Low coverage (too many None/untranslated subtitles)
- Suspiciously short translations (likely truncation)
- Mixed CJK/Latin (中英混杂，可能是翻译失败)
- Translation length ratio outliers (too short/long relative to source)
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

logger = structlog.get_logger()

# Thresholds
_MIN_COVERAGE_RATIO = 0.80  # At least 80% of subtitles must have translations
_MAX_SHORT_RATIO = 0.30  # No more than 30% of translations should be suspiciously short
_MAX_MIXED_RATIO = 0.20  # No more than 20% should be mixed CJK/Latin
_MIN_LENGTH_RATIO = 0.3  # Translation should be at least 30% of source length
_MAX_LENGTH_RATIO = 3.0  # Translation should be at most 300% of source length


def _has_cjk(text: str) -> bool:
    """Check if text contains CJK characters."""
    for ch in text:
        if "一" <= ch <= "鿿":
            return True
    return False


def _has_latin(text: str) -> bool:
    """Check if text contains Latin alphabet characters."""
    return any("a" <= ch.lower() <= "z" for ch in text)


def _is_mixed(text: str) -> bool:
    """True if text contains both CJK and Latin characters."""
    return _has_cjk(text) and _has_latin(text)


def _length_ratio(source: str, translation: str) -> float:
    """Return translation length / source length (by character count)."""
    if not source:
        return 0.0
    return len(translation) / len(source)


@dataclass
class TranslationQualityReport:
    """Quality report for a batch of translations."""

    passed: bool
    coverage_ratio: float
    short_ratio: float
    mixed_ratio: float
    length_outlier_count: int
    issues: list[str]
    total_subtitles: int
    translated_count: int

    @property
    def coverage_percent(self) -> int:
        return int(self.coverage_ratio * 100)


def check_translation_quality(
    sources: list[str],
    translations: list[str | None],
    *,
    min_coverage: float = _MIN_COVERAGE_RATIO,
    max_short_ratio: float = _MAX_SHORT_RATIO,
    max_mixed_ratio: float = _MAX_MIXED_RATIO,
    min_length_ratio: float = _MIN_LENGTH_RATIO,
    max_length_ratio: float = _MAX_LENGTH_RATIO,
) -> TranslationQualityReport:
    """Check translation quality for a batch of subtitles.

    Args:
        sources: Original English texts.
        translations: Translated Chinese texts (None = untranslated).
        min_coverage: Minimum fraction of subtitles that must be translated.
        max_short_ratio: Maximum fraction of translations that can be suspiciously short.
        max_mixed_ratio: Maximum fraction of translations that can be mixed CJK/Latin.
        min_length_ratio: Minimum translation/source length ratio.
        max_length_ratio: Maximum translation/source length ratio.

    Returns:
        TranslationQualityReport with passed=True if all gates pass.
    """
    assert len(sources) == len(translations), "sources and translations must have same length"
    total = len(sources)
    if total == 0:
        return TranslationQualityReport(
            passed=True,
            coverage_ratio=1.0,
            short_ratio=0.0,
            mixed_ratio=0.0,
            length_outlier_count=0,
            issues=[],
            total_subtitles=0,
            translated_count=0,
        )

    translated = [t for t in translations if t is not None and t.strip()]
    coverage = len(translated) / total

    issues: list[str] = []

    # Coverage gate
    if coverage < min_coverage:
        issues.append(f"Coverage {coverage:.0%} < {min_coverage:.0%} ({len(translated)}/{total} translated)")

    # Short translation gate (likely truncation or placeholder)
    short_count = 0
    for _s, t in zip(sources, translations, strict=True):
        if t and len(t.strip()) < 3:
            short_count += 1
    short_ratio = short_count / total
    if short_ratio > max_short_ratio:
        issues.append(f"Short translations {short_ratio:.0%} > {max_short_ratio:.0%} ({short_count}/{total})")

    # Mixed CJK/Latin gate (translation failure or source leak)
    mixed_count = 0
    for _s, t in zip(sources, translations, strict=True):
        if t and _is_mixed(t):
            mixed_count += 1
    mixed_ratio = mixed_count / total
    if mixed_ratio > max_mixed_ratio:
        issues.append(f"Mixed CJK/Latin {mixed_ratio:.0%} > {max_mixed_ratio:.0%} ({mixed_count}/{total})")

    # Length ratio outliers (too short or too long)
    outlier_count = 0
    for s, t in zip(sources, translations, strict=True):
        if t:
            ratio = _length_ratio(s, t)
            if ratio < min_length_ratio or ratio > max_length_ratio:
                outlier_count += 1
    if outlier_count > 0:
        issues.append(
            f"Length outliers: {outlier_count}/{total} (ratio outside [{min_length_ratio}-{max_length_ratio}])"
        )

    passed = len(issues) == 0

    return TranslationQualityReport(
        passed=passed,
        coverage_ratio=coverage,
        short_ratio=short_ratio,
        mixed_ratio=mixed_ratio,
        length_outlier_count=outlier_count,
        issues=issues,
        total_subtitles=total,
        translated_count=len(translated),
    )


def log_translation_quality(video_id: str, report: TranslationQualityReport) -> None:
    """Log a translation quality report at the appropriate level."""
    if not report.passed:
        logger.warning(
            "Translation quality gate FAILED",
            video_id=video_id,
            coverage=f"{report.coverage_percent}%",
            issues=report.issues,
            translated=report.translated_count,
            total=report.total_subtitles,
        )
    else:
        logger.info(
            "Translation quality gate passed",
            video_id=video_id,
            coverage=f"{report.coverage_percent}%",
            translated=report.translated_count,
            total=report.total_subtitles,
        )


async def persist_quality_report(db, video_id: str, report: TranslationQualityReport) -> None:
    """Persist a translation quality report to ``video_quality_reports``.

    Append-only: each call writes a new row. Best-effort - never raises on DB
    failure (the pipeline must not fail because a quality log couldn't be
    saved). Only flushes; the caller's transaction commits.
    """
    try:
        from app.models.video_quality_report import VideoQualityReport

        db.add(
            VideoQualityReport(
                video_id=video_id,
                stage="translation",
                passed=report.passed,
                coverage_ratio=report.coverage_ratio,
                metrics={
                    "coverage_ratio": report.coverage_ratio,
                    "short_ratio": report.short_ratio,
                    "mixed_ratio": report.mixed_ratio,
                    "length_outlier_count": report.length_outlier_count,
                    "translated_count": report.translated_count,
                    "total_subtitles": report.total_subtitles,
                },
                issues=list(report.issues),
                segment_count=None,
            )
        )
        await db.flush()
    except Exception:
        logger.warning(
            "Failed to persist translation quality report",
            video_id=video_id,
            exc_info=True,
        )
