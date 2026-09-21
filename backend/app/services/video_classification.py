"""LLM-based video content classification: topic tags + CEFR difficulty.

Motivation: the normal ingest path never populates ``Video.topic_tags``, so
every card falls back to the generic "综合" chip, and ``difficulty_level``
carries legacy dirty values (e.g. "CR") that the badge renders raw. This
service asks the LLM to classify topic + difficulty from
title/description/subtitles and writes results under strict rules:

- ``topic_tags`` (comma-separated canonical category ids) — overwritten.
- ``difficulty_level`` — written ONLY when NULL (same contract as
  ``difficulty_service.compute_video_difficulty``), so manual admin edits
  and the subtitle-derived fallback are never clobbered.

This module owns the canonical topic category list; ``api.v1.browse``
imports it so the browse filter enum and the LLM whitelist cannot drift
apart.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.logging import get_logger
from app.models.subtitle import Subtitle
from app.models.video import Video
from app.services.ai_service import AIServiceError, get_ai_service

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)


class VideoClassificationError(AIServiceError):
    """Classification failed (LLM error or output failed validation)."""


# Canonical topic taxonomy. browse.py re-exports this as its filter enum;
# the LLM whitelist is derived from the same list.
TOPIC_CATEGORIES: list[dict] = [
    {"id": "all", "label": "All"},
    {"id": "ted", "label": "TED Talks"},
    {"id": "interview", "label": "Interviews"},
    {"id": "news", "label": "News"},
    {"id": "vlog", "label": "Vlogs"},
    {"id": "educational", "label": "Educational"},
    {"id": "movie", "label": "Movie Clips"},
    {"id": "tech", "label": "Tech"},
    {"id": "speech", "label": "Speeches"},
]

TOPIC_CATEGORY_IDS: list[str] = [c["id"] for c in TOPIC_CATEGORIES if c["id"] != "all"]

MAX_TOPICS = 3
_CEFR_RE = re.compile(r"^[ABC][12]$")
_SUBTITLE_SAMPLE_SENTENCES = 40
_SUBTITLE_SAMPLE_MAX_CHARS = 3000


def validate_topics(raw: object) -> list[str]:
    """Whitelist-filter LLM topic output: normalize, dedupe, cap, require ≥1.

    Raises ``VideoClassificationError`` when nothing valid remains — a
    hallucinated tag must never reach the DB (the browse filter and the
    card chip both read this column raw).
    """
    if not isinstance(raw, list):
        raise VideoClassificationError("AI 返回的 topics 非数组")
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        key = item.strip().lower()
        if key in TOPIC_CATEGORY_IDS and key not in out:
            out.append(key)
        if len(out) >= MAX_TOPICS:
            break
    if not out:
        raise VideoClassificationError("AI 返回的 topics 均不在白名单内")
    return out


def validate_cefr(raw: object) -> str | None:
    """Normalize an LLM CEFR guess; None when absent/uncertain/invalid."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    level = raw.strip().upper()
    return level if _CEFR_RE.match(level) else None


def build_classification_prompt(title: str, description: str | None, subtitle_sample: str) -> tuple[str, str]:
    """System/user prompt pair for ``AIService.chat_json``."""
    categories = ", ".join(TOPIC_CATEGORY_IDS)
    system = (
        "You are a content classifier for an English-learning video platform. "
        "Given the video's title, description, and a transcript sample, "
        "output JSON only with two keys:\n"
        f'- "topics": array of 1-{MAX_TOPICS} category ids from [{categories}], '
        "ordered by relevance, the PRIMARY/most specific one first. "
        '"ted" is reserved for TED-style talks; other public or motivational '
        'talks use "speech"; teaching or explainer content uses "educational".\n'
        '- "difficulty": estimated CEFR level (A1, A2, B1, B2, C1, C2) based on '
        "vocabulary and sentence complexity, or null if uncertain."
    )
    parts = [f"Title: {title}"]
    if description:
        parts.append(f"Description: {description[:500]}")
    if subtitle_sample:
        parts.append(f"Transcript sample:\n{subtitle_sample}")
    return system, "\n\n".join(parts)


async def _load_subtitle_sample(db: AsyncSession, video_id: str) -> str:
    result = await db.execute(
        select(Subtitle.text_en)
        .where(Subtitle.video_id == video_id)
        .order_by(Subtitle.sentence_index)
        .limit(_SUBTITLE_SAMPLE_SENTENCES)
    )
    lines = [row[0] for row in result.all() if row[0]]
    return " ".join(lines)[:_SUBTITLE_SAMPLE_MAX_CHARS]


async def classify_video(db: AsyncSession, video: Video) -> dict:
    """Run the LLM classifier for one video and return validated results.

    Pure with respect to persistence (never writes):
    ``{"topics": [canonical ids], "difficulty": "B2" | None}``.
    Raises ``VideoClassificationError`` when the LLM call or validation fails.
    """
    sample = await _load_subtitle_sample(db, video.id)
    if not sample and not video.description:
        raise VideoClassificationError(f"video {video.id} has no subtitles/description to classify")
    system, user = build_classification_prompt(video.title, video.description, sample)
    parsed = await get_ai_service().chat_json(system, user)
    return {
        "topics": validate_topics(parsed.get("topics")),
        "difficulty": validate_cefr(parsed.get("difficulty")),
    }


async def classify_video_metadata(db: AsyncSession, video_id: str) -> bool:
    """Classify one video and persist results. Returns True when written.

    Idempotent: skips videos that already have topic_tags (admin-set or
    previously classified). ``difficulty_level`` is only filled when NULL.
    """
    video = await db.scalar(select(Video).where(Video.id == video_id))
    if video is None:
        raise VideoClassificationError(f"video {video_id} not found")
    if video.topic_tags:
        logger.info("classification: video %s already has topic_tags, skipping", video_id)
        return False
    result = await classify_video(db, video)
    video.topic_tags = ",".join(result["topics"])
    if not video.difficulty_level and result["difficulty"]:
        video.difficulty_level = result["difficulty"]
    await db.commit()
    logger.info(
        "classification: video %s → topic_tags=%s difficulty=%s",
        video_id,
        video.topic_tags,
        result["difficulty"],
    )
    return True
