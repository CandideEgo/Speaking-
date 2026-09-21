"""Video difficulty auto-computation from subtitle word-level annotations.

Computes a CEFR difficulty level (A1–C2) for a video from the exam-level
distribution of the words in its subtitles (``Subtitle.word_levels``). The
result is written to ``Video.difficulty_level`` — only when the field is
currently null (manual admin overrides are never clobbered).

Algorithm:
1. Walk every word occurrence in the video's subtitles. A word that appears in
   N sentences counts N times, so the measure tracks the running text a learner
   actually reads rather than type diversity.
2. For each occurrence take the *lowest* exam level order listing the word —
   its acquisition level. A word in both CET4 and IELTS is met at CET4, so the
   lowest listing is the one that matters; taking the highest (the pre-DEC-043
   behaviour) classified every word that merely appears in the IELTS list as
   C1/C2 and pinned the whole corpus to C2.
3. Compute 超纲率: the share of occurrences whose acquisition level is above
   中考 (order > 1), i.e. outside the ~1600-word junior-high core. This is the
   vocabulary a learner must acquire beyond school basics.
4. Map that share to a CEFR band.

Called best-effort at the tail of ``finalize_video`` and by the
``backfill_difficulty.py`` script for existing videos.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select

from app.core.exam_levels import level_order
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

# 中考 order — words listed at or below it count as school basics, not 超纲.
_BASIC_ORDER = level_order("zhongkao")

# 超纲率 → CEFR. Bands were calibrated against the LLM CEFR estimates for the
# 49-video production corpus (2026-09-21): mean absolute band error 0.25, 75%
# exact, 100% within one band. Each cut point sits in a gap in that data, so
# the bands are not knife-edge.
_BEYOND_RATIO_TO_CEFR: list[tuple[float, str]] = [
    (0.17, "A1"),
    (0.26, "A2"),
    (0.30, "B1"),
    (0.47, "B2"),
    (0.55, "C1"),
]
_CEFR_ABOVE = "C2"

# A ratio over fewer occurrences than this is noise, not a measurement.
_MIN_OCCURRENCES = 30

# Statuses the offline difficulty jobs (scripts/backfill_*.py) may touch. Before
# these states the subtitle set is still being written, so a level computed from
# it can come from partial data — and because a non-NULL level blocks every
# later recompute (see ``compute_video_difficulty``), a wrong value would stick.
# Cleanup and refill must share this set: a value nulled by cleanup is only
# guaranteed a refill if both jobs look at the same videos.
DIFFICULTY_BACKFILL_STATUSES = (VideoStatus.ready, VideoStatus.ready_subtitles)


def _ratio_to_cefr(ratio: float) -> str:
    """Map 超纲率 to a CEFR band."""
    for threshold, cefr in _BEYOND_RATIO_TO_CEFR:
        if ratio < threshold:
            return cefr
    return _CEFR_ABOVE


def beyond_basic_ratio(subtitle_word_levels: list[dict | None]) -> float | None:
    """超纲率: share of annotated word occurrences above the 中考 vocabulary.

    ``None`` when there are too few occurrences to measure. Exposed separately
    from the band mapping so calibration work can read the raw statistic.
    """
    total = 0
    beyond = 0
    for wl in subtitle_word_levels:
        if not wl:
            continue
        for _surface, levels in wl.items():
            if not levels:
                continue
            orders = [level_order(lv) for lv in levels]
            acquisition = min((o for o in orders if o > 0), default=0)
            if acquisition == 0:
                # Not in any exam list — no acquisition level to compare.
                continue
            total += 1
            if acquisition > _BASIC_ORDER:
                beyond += 1

    if total < _MIN_OCCURRENCES:
        return None
    return beyond / total


def compute_difficulty_from_word_levels(
    subtitle_word_levels: list[dict | None],
) -> str | None:
    """Pure computation: given a list of Subtitle.word_levels dicts, return CEFR level.

    Each dict maps lowercase surface token → list of exam level keys.
    Returns None when there's insufficient data to compute.
    """
    ratio = beyond_basic_ratio(subtitle_word_levels)
    return None if ratio is None else _ratio_to_cefr(ratio)


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
