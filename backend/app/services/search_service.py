"""Search service — rebuild search_vector with subtitle content.

The PostgreSQL trigger automatically updates ``search_vector`` from
``title`` and ``topic_tags`` on INSERT/UPDATE.  This module provides
the application-level function that *adds* aggregated subtitle text
(weight C) to the search vector.

Call ``rebuild_video_search_vector()`` after subtitle processing
completes (in the video processing pipeline).
"""

import structlog
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subtitle import Subtitle
from app.models.video import Video

logger = structlog.get_logger(__name__)


async def rebuild_video_search_vector(db: AsyncSession, video_id: str) -> None:
    """Rebuild search_vector for a video including aggregated subtitle text.

    Weights:
        A = title (highest relevance)
        B = topic_tags
        C = subtitle text_en (aggregated from all subtitle rows)

    This function uses a raw SQL UPDATE because SQLAlchemy doesn't have
    first-class support for tsvector construction with ``setweight``.
    """
    # Fetch the video to verify it exists
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        logger.warning("rebuild_search_vector: video not found", video_id=video_id)
        return

    # Aggregate subtitle text_en
    sub_result = await db.execute(select(func.string_agg(Subtitle.text_en, " ")).where(Subtitle.video_id == video_id))
    subtitle_text = sub_result.scalar() or ""

    # Build tsvector with weights: A=title, B=topic_tags, C=subtitles
    stmt = text("""
        UPDATE videos SET search_vector =
            setweight(to_tsvector('english', COALESCE(:title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(:tags, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(:subs, '')), 'C')
        WHERE id = :vid
    """)
    await db.execute(
        stmt,
        {
            "title": video.title or "",
            "tags": video.topic_tags or "",
            "subs": subtitle_text,
            "vid": video_id,
        },
    )
    await db.commit()
    logger.info(
        "search_vector_rebuilt",
        video_id=video_id,
        subtitle_chars=len(subtitle_text),
    )
