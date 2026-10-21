"""Channel service - author pages (ADR-0014, rev. 2026-08-30).

Channels are the "content source" dimension, orthogonal to the topic-tag
dimension (recommendations). Since the 2026-08-30 revision (full author
pages), ingest auto-creates a channel for every scraped upstream channel id
(``ensure_channel_for``); admin-curated rows lead the public listing, auto
rows follow by video count. Public reads only ever see ``is_visible``
channels and published/ready videos inside them; empty channels are hidden
from the public list.

The scraped upstream fields on Video (``channel_id``/``channel_name``) stay
untouched external metadata — ``Channel.upstream_channel_id`` is the bridge
used by :func:`auto_attach_channel` at ingest time.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.errors import BadRequestError
from app.models.channel import Channel
from app.models.video import Video, VideoStatus
from app.schemas.pagination import paginated
from app.services import channel_learning
from app.services.video_card import video_card_payload

if TYPE_CHECKING:
    from collections.abc import Iterable

    from sqlalchemy.ext.asyncio import AsyncSession

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$")

# Videos shown inside a channel: same publish rules as the browse feed.
_PUBLIC_VIDEO_FILTER = (
    Video.is_official.is_(True),
    Video.is_published.is_(True),
    Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
)


def slugify(name: str) -> str:
    """ASCII slug from a display name (Chinese names fall back to a hash-free
    dash-joined transliteration is out of scope — admins pass explicit slugs)."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:120]


def _channel_public(
    ch: Channel,
    video_count: int,
    cover_fallback: str | None = None,
    facts: dict | None = None,
) -> dict:
    item = {
        "id": ch.id,
        "name": ch.name,
        "slug": ch.slug,
        "description": ch.description,
        # Auto-created channels have no cover of their own - fall back to the
        # newest video thumbnail so every author page shows a real image.
        "cover_url": ch.cover_url or cover_fallback,
        "video_count": video_count,
    }
    # Facts come from real public videos (see channel_learning). Admin rows omit
    # them, so existing admin consumers keep their exact key set.
    if facts:
        item.update(facts)
    return item


def latest_video_payload(video: Video | None) -> dict | None:
    """Newest public video shown as auxiliary info on a channel card."""
    if video is None:
        return None
    return {
        "id": video.id,
        "title": video.title,
        "thumbnail_url": video.thumbnail_url,
        "duration": video.duration,
        "published_at": video.published_at.isoformat() if video.published_at else None,
        "difficulty_level": video.difficulty_level,
    }


async def public_video_counts(db: AsyncSession, channel_ids: list[str]) -> dict[str, int]:
    if not channel_ids:
        return {}
    rows = (
        await db.execute(
            select(Video.channel_ref, func.count())
            .where(Video.channel_ref.in_(channel_ids), *_PUBLIC_VIDEO_FILTER)
            .group_by(Video.channel_ref)
        )
    ).all()
    return {cid: n for cid, n in rows}


async def latest_public_videos(db: AsyncSession, channel_ids: list[str]) -> dict[str, Video]:
    """Return each channel's newest publicly playable video in one query."""
    if not channel_ids:
        return {}
    ranked = (
        select(
            Video.id.label("video_id"),
            Video.channel_ref.label("channel_ref"),
            func.row_number()
            .over(
                partition_by=Video.channel_ref,
                order_by=(Video.created_at.desc(), Video.id.desc()),
            )
            .label("video_rank"),
        )
        .where(Video.channel_ref.in_(channel_ids), *_PUBLIC_VIDEO_FILTER)
        .subquery()
    )
    rows = await db.execute(
        select(Video, ranked.c.channel_ref).join(ranked, Video.id == ranked.c.video_id).where(ranked.c.video_rank == 1)
    )
    return {channel_ref: video for video, channel_ref in rows.all()}


async def _latest_covers(db: AsyncSession, channel_ids: list[str]) -> dict[str, str | None]:
    """Newest public video thumbnail per channel (cover fallback, admin list)."""
    if not channel_ids:
        return {}
    stmt = (
        select(Video.channel_ref, Video.thumbnail_url)
        .where(Video.channel_ref.in_(channel_ids), *_PUBLIC_VIDEO_FILTER)
        .order_by(Video.channel_ref, Video.created_at.desc())
    )
    covers: dict[str, str | None] = {}
    for ref, thumb in (await db.execute(stmt)).all():
        if ref not in covers:
            covers[ref] = thumb
    return covers


async def _public_videos_by_channel(db: AsyncSession, channel_ids: list[str]) -> dict[str, list[Video]]:
    """All public videos of the given channels, newest first.

    The list response needs each channel's real titles (search + learning
    directions) and its difficulty range, so one ordered query beats N+1
    queries. The current catalog is small; if a channel grows into hundreds of
    rows, page this by channel rather than dropping the content-based facts.
    """
    if not channel_ids:
        return {}
    rows = (
        await db.execute(
            select(Video)
            .where(Video.channel_ref.in_(channel_ids), *_PUBLIC_VIDEO_FILTER)
            .order_by(Video.channel_ref, Video.created_at.desc(), Video.id.desc())
        )
    ).scalars()
    grouped: dict[str, list[Video]] = {channel_id: [] for channel_id in channel_ids}
    for video in rows:
        if video.channel_ref:
            grouped[video.channel_ref].append(video)
    return grouped


async def list_public_channels(db: AsyncSession, page: int = 1, page_size: int = 50) -> dict:
    """Visible non-empty channels as a standard paginated envelope.

    Curated channels (``is_auto=False``) lead by sort_order/name; auto-created
    author pages follow by video count (desc). Channels without public videos
    are hidden - an auto-created channel always contains at least its trigger
    video once published, so this mainly hides freshly-created curated rows.
    """
    channels = list(
        (
            await db.execute(
                select(Channel).where(Channel.is_visible.is_(True)).order_by(Channel.sort_order, Channel.name)
            )
        ).scalars()
    )
    counts = await public_video_counts(db, [c.id for c in channels])
    entries: list[tuple[tuple, Channel, int]] = []
    for c in channels:
        n = counts.get(c.id, 0)
        if n == 0:
            continue
        # Curated rows first (sort_order, name); auto rows after, biggest first.
        key = (0, c.sort_order, c.name) if not c.is_auto else (1, -n, c.name)
        entries.append((key, c, n))
    entries.sort(key=lambda e: e[0])

    total = len(entries)
    start = (page - 1) * page_size
    page_entries = entries[start : start + page_size]
    page_channels = [channel for _, channel, _ in page_entries]
    videos_by_channel = await _public_videos_by_channel(db, [channel.id for channel in page_channels])
    items = []
    for _, channel, video_count in page_entries:
        videos = videos_by_channel.get(channel.id, [])
        latest_video = videos[0] if videos else None
        facts = channel_learning.channel_facts(channel.slug, videos)
        item = _channel_public(
            channel,
            video_count,
            latest_video.thumbnail_url if latest_video else None,
            facts,
        )
        item["latest_video"] = latest_video_payload(latest_video)
        items.append(item)
    return paginated(items, page=page, page_size=page_size, total=total)


async def get_channel_detail(db: AsyncSession, slug: str, page: int, page_size: int) -> dict | None:
    channel = (await db.execute(select(Channel).where(Channel.slug == slug))).scalar_one_or_none()
    if channel is None or not channel.is_visible:
        return None

    public_stmt = select(Video).where(Video.channel_ref == channel.id, *_PUBLIC_VIDEO_FILTER)
    total = (await db.execute(select(func.count()).select_from(public_stmt.subquery()))).scalar_one()
    videos = list(
        (
            await db.execute(
                public_stmt.order_by(Video.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
            )
        ).scalars()
    )

    # Facts (directions / difficulty / titles) and the cover fallback need the
    # whole public set, not just the requested page; both headers stay stable
    # while the user pages through the video list.
    fact_videos = list((await db.execute(public_stmt.order_by(Video.created_at.desc(), Video.id.desc()))).scalars())
    facts = channel_learning.channel_facts(channel.slug, fact_videos)
    newest = fact_videos[0] if fact_videos else None
    cover_fallback = newest.thumbnail_url if newest else None

    upstream_stats: dict = {}
    if newest:
        upstream_stats = (newest.external_meta or {}).get("channel") or {}

    channel_dict = _channel_public(channel, total, cover_fallback, facts)
    channel_dict["follower_count"] = upstream_stats.get("follower_count")
    channel_dict["is_verified"] = upstream_stats.get("is_verified")

    recommended_start = None
    start_video, basis = await _recommended_start_video(db, channel.id)
    if start_video is not None:
        recommended_start = {
            "video": video_card_payload(start_video, channel.slug),
            "basis": basis,
        }

    return {
        "channel": channel_dict,
        "recommended_start": recommended_start,
        "videos": paginated(
            [video_card_payload(v, channel.slug) for v in videos], page=page, page_size=page_size, total=total
        ),
    }


async def _recommended_start_video(db: AsyncSession, channel_id: str) -> tuple[Video | None, str]:
    """First segment worth starting with, with an auditable basis.

    Prefer the lowest CEFR level (tie-break: shortest, then newest). Only when
    no video carries a usable level do we fall back to the newest public video,
    and the caller labels that as "最近收录" rather than "推荐入门".
    """
    leveled = (
        await db.execute(
            select(Video)
            .where(
                Video.channel_ref == channel_id,
                *_PUBLIC_VIDEO_FILTER,
                Video.difficulty_level.in_(channel_learning.CEFR_ORDER),
            )
            .order_by(
                Video.difficulty_level,
                Video.duration.asc().nulls_last(),
                Video.created_at.desc(),
                Video.id.desc(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if leveled is not None:
        return leveled, channel_learning.recommended_start_basis(leveled.difficulty_level)
    newest = (
        await db.execute(
            select(Video)
            .where(Video.channel_ref == channel_id, *_PUBLIC_VIDEO_FILTER)
            .order_by(Video.created_at.desc(), Video.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return newest, channel_learning.recommended_start_basis(None)


async def _unique_auto_slug(db: AsyncSession, name: str, upstream_id: str) -> str:
    """Slug for an auto-created channel: ASCII slug of the display name when
    usable, else the lowercased upstream id (YouTube ``UCxxx`` ids are unique
    and slug-safe); a short hash suffix resolves collisions. The caller must
    flush/commit for the chosen slug to exist."""
    upstream = (upstream_id or "").strip().lower()
    hashed = hashlib.sha1(upstream_id.encode("utf-8")).hexdigest()[:8]
    candidates = [
        c for c in (slugify(name), upstream, f"{upstream}-{hashed}", f"ch-{hashed}") if c and SLUG_RE.match(c)
    ]
    for cand in candidates:
        clash = (await db.execute(select(Channel.id).where(Channel.slug == cand))).scalar_one_or_none()
        if clash is None:
            return cand
    # Unreachable in practice (random suffix), but keeps the return total.
    tiebreak = hashlib.sha1(f"{upstream_id}:fallback".encode()).hexdigest()[:6]
    return f"ch-{hashed}-{tiebreak}"


async def ensure_channel_for(db: AsyncSession, upstream_id: str, name: str | None) -> Channel:
    """Find the channel registered for an upstream id, or auto-create one
    (full author pages, ADR-0014 rev. 2026-08-30). Shared by ingest and the
    backfill script. Caller owns the transaction (flush happens here).

    Race note: two concurrent ingests from the same author can both miss the
    SELECT and try to INSERT; the unique index on ``upstream_channel_id``
    rejects the second, the Celery retry then finds the winner.
    """
    channel = (await db.execute(select(Channel).where(Channel.upstream_channel_id == upstream_id))).scalar_one_or_none()
    if channel is not None:
        return channel
    display = (name or "").strip() or upstream_id
    channel = Channel(
        name=display,
        slug=await _unique_auto_slug(db, display, upstream_id),
        upstream_channel_id=upstream_id,
        is_auto=True,
        is_visible=True,
    )
    db.add(channel)
    await db.flush()
    return channel


async def auto_attach_channel(db: AsyncSession, video: Video) -> None:
    """Attach a freshly ingested video to its author's channel, creating the
    channel on first sight. No-op for local videos (no scraped channel_id) or
    videos already attached; a registered curated channel wins as-is."""
    if video.channel_ref or not video.channel_id:
        return
    channel = await ensure_channel_for(db, video.channel_id, video.channel_name)
    video.channel_ref = channel.id


async def channel_slugs_for(db: AsyncSession, videos: Iterable[Video]) -> dict[str, str]:
    """Map ``channel_ref -> slug`` for the given videos, so feed serializers
    can link each card to its author page. Empty map when nothing is attached."""
    refs = {v.channel_ref for v in videos if v.channel_ref}
    if not refs:
        return {}
    rows = (await db.execute(select(Channel.id, Channel.slug).where(Channel.id.in_(refs)))).all()
    return {cid: slug for cid, slug in rows}


# ---------------------------------------------------------------------------
# Admin surface
# ---------------------------------------------------------------------------


async def list_admin_channels(db: AsyncSession) -> list[dict]:
    channels = list((await db.execute(select(Channel).order_by(Channel.sort_order, Channel.name))).scalars())
    counts = await public_video_counts(db, [c.id for c in channels])
    covers = await _latest_covers(db, [c.id for c in channels])
    out = []
    for c in channels:
        d = _channel_public(c, counts.get(c.id, 0), covers.get(c.id))
        d.update(
            {
                "upstream_channel_id": c.upstream_channel_id,
                "sort_order": c.sort_order,
                "is_visible": c.is_visible,
                "is_auto": c.is_auto,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )
        out.append(d)
    return out


async def create_channel(db: AsyncSession, payload: dict) -> Channel:
    name = (payload.get("name") or "").strip()
    if not name:
        raise BadRequestError("频道名称不能为空")
    slug = (payload.get("slug") or "").strip().lower() or slugify(name)
    if not SLUG_RE.match(slug):
        raise BadRequestError("slug 只能包含小写字母、数字和连字符（首尾须为字母/数字）")
    exists = (await db.execute(select(Channel.id).where(Channel.slug == slug))).scalar_one_or_none()
    if exists:
        raise BadRequestError(f"slug 已存在: {slug}")

    upstream = (payload.get("upstream_channel_id") or "").strip() or None
    channel = Channel(
        name=name,
        slug=slug,
        description=payload.get("description"),
        cover_url=payload.get("cover_url"),
        upstream_channel_id=upstream,
        sort_order=int(payload.get("sort_order") or 0),
        is_visible=bool(payload.get("is_visible", True)),
    )
    db.add(channel)
    await db.flush()
    if upstream:
        # Attach existing videos already scraped from this upstream channel.
        from sqlalchemy import update

        await db.execute(
            update(Video)
            .where(Video.channel_id == upstream, Video.channel_ref.is_(None))
            .values(channel_ref=channel.id)
        )
    return channel


_PATCH_FIELDS = ("name", "description", "cover_url", "upstream_channel_id", "sort_order", "is_visible")


async def update_channel(db: AsyncSession, channel_id: str, payload: dict) -> Channel | None:
    channel = await db.get(Channel, channel_id)
    if channel is None:
        return None
    for field in _PATCH_FIELDS:
        if field in payload and payload[field] is not None:
            setattr(channel, field, payload[field])
    slug_in = payload.get("slug")
    if slug_in:
        slug = str(slug_in).strip().lower()
        if not SLUG_RE.match(slug):
            raise BadRequestError("slug 只能包含小写字母、数字和连字符（首尾须为字母/数字）")
        clash = (
            await db.execute(select(Channel.id).where(Channel.slug == slug, Channel.id != channel_id))
        ).scalar_one_or_none()
        if clash:
            raise BadRequestError(f"slug 已存在: {slug}")
        channel.slug = slug
    await db.flush()
    return channel


async def delete_channel(db: AsyncSession, channel_id: str) -> bool:
    channel = await db.get(Channel, channel_id)
    if channel is None:
        return False
    # videos.channel_ref is SET NULL on delete — videos survive.
    await db.delete(channel)
    await db.flush()
    return True


async def invalidate_channel_caches(video_ids: Iterable[str]) -> None:
    """Best-effort cache invalidation after channel assignments change: feed
    cards and video detail responses embed the author-page link."""
    from app.services.recommendation_service import invalidate_home_cache
    from app.services.video_cache import invalidate_browse_cache, invalidate_video_detail_cache

    await invalidate_browse_cache()
    await invalidate_home_cache()
    for vid in video_ids:
        await invalidate_video_detail_cache(vid)
