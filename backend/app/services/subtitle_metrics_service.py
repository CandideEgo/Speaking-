"""Subtitle-derived speech metrics — 阶段 3 of the video feature plan.

Computes two learning-value indicators straight from the subtitle rows:

- ``wpm`` (words per minute): total word tokens / (last subtitle end time / 60).
  Rough bands: 80-120 慢速 / 120-160 正常 / 160-200 快速 / 200+ 困难.
- ``vocabulary_density``: unique tokens / total tokens (higher = more
  lexically demanding content).

Same compute-on-null pattern as ``difficulty_service``: values are written
only while null, so manual fixes or earlier runs are never clobbered. Called
best-effort at the ``finalize_video`` tail — never fails the pipeline.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select

from app.models.subtitle import Subtitle
from app.models.video import Video

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

# Word tokens: latin letters/digits/apostrophes (contractions stay one token).
_TOKEN_RE = re.compile(r"[A-Za-z0-9']+")

# Below this many subtitle lines the estimate is meaningless.
_MIN_LINES = 3


def _tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


def compute_speech_metrics(
    subtitle_rows: list[tuple[str | None, float | None]],
) -> tuple[float | None, float | None]:
    """Pure computation: ``(wpm, vocabulary_density)`` from ``(text_en, end_time)`` pairs.

    Returns ``(None, None)`` when there's insufficient data (< _MIN_LINES
    non-empty lines or no usable timeline).
    """
    usable = [(text, end) for text, end in subtitle_rows if text and text.strip()]
    if len(usable) < _MIN_LINES:
        return None, None

    tokens: list[str] = []
    for text, _end in usable:
        tokens.extend(_tokenize(text))
    total = len(tokens)
    if total == 0:
        return None, None

    density = round(len(set(tokens)) / total, 4)

    max_end = max((end for _text, end in usable if end is not None and end > 0), default=None)
    if not max_end:
        return None, density  # no timeline → WPM impossible, density still valid

    wpm = round(total / (max_end / 60.0), 1)
    return wpm, density


async def compute_video_speech_metrics(db: AsyncSession, video_id: str) -> tuple[float | None, float | None] | None:
    """Compute + persist WPM/vocabulary-density for a video (compute-on-null).

    Skips entirely when both fields are already set. Returns the resulting
    ``(wpm, density)`` tuple, or ``None`` when the video doesn't exist or has
    insufficient subtitle data.
    """
    video = await db.scalar(select(Video).where(Video.id == video_id))
    if video is None:
        logger.warning("speech_metrics: video %s not found", video_id)
        return None

    if video.wpm is not None and video.vocabulary_density is not None:
        return video.wpm, video.vocabulary_density

    result = await db.execute(select(Subtitle.text_en, Subtitle.end_time).where(Subtitle.video_id == video_id))
    rows = result.all()

    wpm, density = compute_speech_metrics(rows)
    if wpm is None and density is None:
        logger.info("speech_metrics: video %s has insufficient subtitle data, skipping", video_id)
        return None

    if video.wpm is None:
        video.wpm = wpm
    if video.vocabulary_density is None:
        video.vocabulary_density = density
    await db.commit()
    logger.info("speech_metrics: video %s → wpm=%s density=%s", video_id, video.wpm, video.vocabulary_density)
    return video.wpm, video.vocabulary_density
