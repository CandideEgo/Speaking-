"""Video difficulty auto-computation from subtitle word-level annotations.

Computes a CEFR difficulty level (A1–C2) for a video based on the exam-level
distribution of words in its subtitles (``Subtitle.word_levels``). The result
is written to ``Video.difficulty_level`` — only when the field is currently
null (manual admin overrides are never clobbered).

Algorithm:
1. Collect all word-level annotations from the video's subtitles.
2. For each annotated word, take its highest exam level order.
3. Compute the 75th-percentile order (represents the "challenging" tier of
   vocabulary a learner will encounter).
4. Map the percentile to a CEFR band.

Called best-effort at the tail of ``finalize_video`` and by the
``backfill_difficulty.py`` script for existing videos.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select

from app.core.exam_levels import level_order
from app.models.subtitle import Subtitle
from app.models.video import Video

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

# Exam order → CEFR mapping thresholds (75th-percentile order).
# order 1 = zhongkao, 2 = gaoKao, 3 = cet4, 4 = cet6, 5 = ky, 6 = ielts/toefl, 7 = gre
_ORDER_TO_CEFR: list[tuple[float, str]] = [
    (1.5, "A1"),
    (2.5, "A2"),
    (3.5, "B1"),
    (4.5, "B2"),
    (5.5, "C1"),
]
_CEFR_ABOVE = "C2"


def _order_to_cefr(order: float) -> str:
    """Map a numeric exam-level order to a CEFR level string."""
    for threshold, cefr in _ORDER_TO_CEFR:
        if order <= threshold:
            return cefr
    return _CEFR_ABOVE


def _percentile(sorted_values: list[int], pct: float) -> float:
    """Compute the pct-th percentile from a sorted list of ints."""
    if not sorted_values:
        return 0.0
    n = len(sorted_values)
    idx = (pct / 100.0) * (n - 1)
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    return sorted_values[lo] * (1 - frac) + sorted_values[hi] * frac


def compute_difficulty_from_word_levels(
    subtitle_word_levels: list[dict | None],
) -> str | None:
    """Pure computation: given a list of Subtitle.word_levels dicts, return CEFR level.

    Each dict maps lowercase surface token → list of exam level keys.
    Returns None when there's insufficient data to compute.
    """
    orders: list[int] = []
    for wl in subtitle_word_levels:
        if not wl:
            continue
        for _surface, levels in wl.items():
            if not levels:
                continue
            max_ord = max(level_order(lv) for lv in levels)
            if max_ord > 0:
                orders.append(max_ord)

    if len(orders) < 3:
        # Too few annotated words to make a meaningful judgment.
        return None

    orders.sort()
    p75 = _percentile(orders, 75)
    return _order_to_cefr(p75)


async def compute_video_difficulty(db: AsyncSession, video_id: str) -> str | None:
    """Compute and persist the CEFR difficulty for a video.

    Only writes when ``Video.difficulty_level`` is currently NULL — never
    overwrites a manually-set value. Returns the computed level (or None if
    skipped / insufficient data).
    """
    video = await db.scalar(select(Video).where(Video.id == video_id))
    if video is None:
        logger.warning("difficulty: video %s not found", video_id)
        return None

    if video.difficulty_level:
        # Already set (manually or previously computed) — don't overwrite.
        return video.difficulty_level

    result = await db.execute(select(Subtitle.word_levels).where(Subtitle.video_id == video_id))
    word_levels_list = [row[0] for row in result.all()]

    cefr = compute_difficulty_from_word_levels(word_levels_list)
    if cefr is None:
        logger.info("difficulty: video %s has insufficient word data, skipping", video_id)
        return None

    video.difficulty_level = cefr
    await db.commit()
    logger.info("difficulty: video %s → %s", video_id, cefr)
    return cefr
