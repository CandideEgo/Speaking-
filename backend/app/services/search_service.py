"""Search service — video and subtitle search, plus search_vector maintenance.

The PostgreSQL trigger automatically updates ``search_vector`` from
``title`` and ``topic_tags`` on INSERT/UPDATE.  This module provides:

- ``rebuild_video_search_vector()`` — adds aggregated subtitle text (weight C)
  to the search vector.  Call after subtitle processing completes.
- ``search_videos()`` — full-text + ILIKE search across video titles/tags.
- ``search_subtitles()`` — full-text + ILIKE search across subtitle text,
  grouped by video with snippets.
"""

import structlog
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus
from app.schemas.video import VideoResponse

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Search vector maintenance
# ---------------------------------------------------------------------------


async def rebuild_video_search_vector(db: AsyncSession, video_id: str) -> None:
    """Rebuild search_vector for a video including aggregated subtitle text.

    Weights:
        A = title (highest relevance)
        B = topic_tags
        C = subtitle text_en (aggregated from all subtitle rows)

    This function uses a raw SQL UPDATE because SQLAlchemy doesn't have
    first-class support for tsvector construction with ``setweight``.
    """
    from sqlalchemy import text

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


# ---------------------------------------------------------------------------
# Video search
# ---------------------------------------------------------------------------


async def search_videos(
    db: AsyncSession,
    query: str,
    limit: int = 20,
    user_id: str | None = None,
) -> list[VideoResponse]:
    """Search videos using PostgreSQL full-text search with ILIKE fallback.

    Uses ``plainto_tsquery`` for safe user input handling and ``ts_rank``
    for relevance scoring.  An ILIKE fallback ensures partial matches
    and non-English queries still work.

    Access control: official videos are always visible; user-submitted
    videos are only visible to their owner.
    Only videos with status 'ready' or 'ready_subtitles' are searchable.
    """
    if not query or not query.strip():
        return []

    limit = max(1, min(limit, 50))
    q = query.strip()
    # Escape LIKE wildcards to prevent injection (e.g. searching "%" matches everything)
    escaped_q = q.replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped_q}%"

    # Full-text search query (handles special chars safely)
    ts_query = func.plainto_tsquery("english", query.strip())

    # Relevance: ts_rank for FTS + small ILIKE bonus for partial matches
    relevance = func.ts_rank(Video.search_vector, ts_query) + case(
        (Video.title.ilike(pattern, escape="\\"), 0.5),
        else_=0,
    )

    # Base filters: status ready + access control
    status_filter = Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles])
    # Official videos must also be published; user-owned videos are always
    # visible to their owner regardless of publish state.
    access_filter = or_(
        and_(Video.is_official == True, Video.is_published == True),
        Video.user_id == user_id,
    )

    # Match via tsvector OR ILIKE fallback (for partial/non-English queries)
    match_filter = or_(
        Video.search_vector.op("@@")(ts_query),
        Video.title.ilike(pattern, escape="\\"),
        Video.topic_tags.ilike(pattern, escape="\\"),
    )

    stmt = (
        select(Video)
        .where(status_filter, access_filter, match_filter)
        .order_by(relevance.desc(), Video.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    videos = result.scalars().all()
    return [VideoResponse.model_validate(v) for v in videos]


# ---------------------------------------------------------------------------
# Subtitle search
# ---------------------------------------------------------------------------


async def search_subtitles(
    db: AsyncSession,
    query: str,
    limit: int = 10,
    user_id: str | None = None,
) -> list[dict]:
    """Search subtitle text, return video + matching subtitle snippets.

    Groups results by video, showing up to 3 matching subtitle snippets
    per video.  Uses FTS on subtitle text_en with ILIKE fallback.
    """
    if not query or not query.strip():
        return []

    limit = max(1, min(limit, 30))
    q = query.strip()
    escaped_q = q.replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped_q}%"
    ts_query = func.plainto_tsquery("english", q)

    # Find subtitles matching the query, join to video for access control
    stmt = (
        select(Subtitle, Video)
        .join(Video, Subtitle.video_id == Video.id)
        .where(
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
            or_(and_(Video.is_official == True, Video.is_published == True), Video.user_id == user_id),
            or_(
                Subtitle.text_en.ilike(pattern, escape="\\"),
                Subtitle.text_en.op("@@")(ts_query),
            ),
        )
        .order_by(Video.created_at.desc())
        .limit(limit * 5)  # over-fetch to deduplicate videos
    )

    result = await db.execute(stmt)
    rows = result.all()

    # Group by video, take up to 3 matching snippets per video
    seen_videos: dict[str, dict] = {}
    for sub, vid in rows:
        if vid.id not in seen_videos:
            seen_videos[vid.id] = {
                "video": VideoResponse.model_validate(vid).model_dump(),
                "matching_subtitles": [],
            }
        entry = seen_videos[vid.id]
        if len(entry["matching_subtitles"]) < 3:
            entry["matching_subtitles"].append(
                {
                    "id": sub.id,
                    "text_en": sub.text_en,
                    "start_time": sub.start_time,
                    "end_time": sub.end_time,
                }
            )

    return list(seen_videos.values())[:limit]
