"""Chinese display title for a video.

``Video.title`` stays the canonical (usually English) title: search, dedup and
standard-version matching all key off it. ``Video.title_zh`` is a display-only
translation written by the pipeline, backfilled for existing rows, and editable
by admins. Nothing here is allowed to fail a pipeline step: a missing Chinese
title is a cosmetic degradation, not a broken video.
"""

from __future__ import annotations

import re

import structlog

logger = structlog.get_logger()

TITLE_ZH_MAX = 500
_CJK = re.compile(r"[㐀-鿿]")


def normalize_title_zh(text: str | None) -> str | None:
    """Trim, collapse whitespace, truncate to the column width, empty → None."""
    cleaned = " ".join((text or "").split()).strip()
    return cleaned[:TITLE_ZH_MAX] or None


async def translate_video_title(title: str, *, engine: str | None = None) -> str | None:
    """Return a Chinese display title, or None when translation is unavailable.

    A title that is already Chinese is its own translation — returning it (rather
    than None) also lets the backfill script converge instead of selecting the
    same row on every run. A translation that comes back identical to the source
    is treated the same way: the UI hides the duplicate secondary line.
    """
    cleaned = normalize_title_zh(title)
    if not cleaned:
        return None
    if _CJK.search(cleaned):
        return cleaned

    try:
        from app.services.translation import TranslationService, get_translation_service

        service = TranslationService(engine_override=engine) if engine else get_translation_service()
        results = await service.translate_batch([cleaned])
    except Exception:
        logger.warning(
            "Video title translation failed",
            title=cleaned[:80],
            engine=engine,
            exc_info=True,
        )
        return None

    translated = normalize_title_zh(results[0] if results else None)
    if not translated:
        return None
    return cleaned if translated == cleaned else translated
