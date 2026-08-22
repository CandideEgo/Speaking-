"""Channel curation service (ADR-0014).

Channels are the admin-maintained "content source" dimension, orthogonal to
the topic-tag dimension (recommendations). Public reads only ever see
``is_visible`` channels and published/ready videos inside them; the admin
surface manages the rows themselves.

The scraped upstream fields on Video (``channel_id``/``channel_name``) stay
untouched external metadata — ``Channel.upstream_channel_id`` is the bridge
used by :func:`auto_attach_channel` at ingest time.
"""

from __future__ import annotations

import re
import unicodedata
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.api.v1.browse import _video_to_dict
from app.models.channel import Channel
from app.models.video import Video, VideoStatus
from app.schemas.pagination import paginated

if TYPE_CHECKING:
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


def _channel_public(ch: Channel, video_count: int) -> dict:
    return {
        "id": ch.id,
        "name": ch.name,
        "slug": ch.slug,
        "description": ch.description,
        "cover_url": ch.cover_url,
        "video_count": video_count,
    }


async def _video_counts(db: AsyncSession, channel_ids: list[str]) -> dict[str, int]:
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


async def list_public_channels(db: AsyncSession) -> list[dict]:
    channels = list(
        (
            await db.execute(
                select(Channel).where(Channel.is_visible.is_(True)).order_by(Channel.sort_order, Channel.name)
            )
        ).scalars()
    )
    counts = await _video_counts(db, [c.id for c in channels])
    return [_channel_public(c, counts.get(c.id, 0)) for c in channels]


async def get_channel_detail(db: AsyncSession, slug: str, page: int, page_size: int) -> dict | None:
    channel = (await db.execute(select(Channel).where(Channel.slug == slug))).scalar_one_or_none()
    if channel is None or not channel.is_visible:
        return None

    stmt = select(Video).where(Video.channel_ref == channel.id, *_PUBLIC_VIDEO_FILTER).order_by(Video.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    videos = list((await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).scalars())

    return {
        "channel": _channel_public(channel, total),
        "videos": paginated([_video_to_dict(v) for v in videos], page=page, page_size=page_size, total=total),
    }


async def auto_attach_channel(db: AsyncSession, video: Video) -> None:
    """Attach a freshly ingested video to a channel registered for its upstream
    channel id. No-op when the video has no scraped channel_id, no channel is
    registered for it, or the video already belongs to a channel."""
    if video.channel_ref or not video.channel_id:
        return
    channel = (
        await db.execute(select(Channel).where(Channel.upstream_channel_id == video.channel_id))
    ).scalar_one_or_none()
    if channel is not None:
        video.channel_ref = channel.id


# ---------------------------------------------------------------------------
# Admin surface
# ---------------------------------------------------------------------------


async def list_admin_channels(db: AsyncSession) -> list[dict]:
    channels = list((await db.execute(select(Channel).order_by(Channel.sort_order, Channel.name))).scalars())
    counts = await _video_counts(db, [c.id for c in channels])
    out = []
    for c in channels:
        d = _channel_public(c, counts.get(c.id, 0))
        d.update(
            {
                "upstream_channel_id": c.upstream_channel_id,
                "sort_order": c.sort_order,
                "is_visible": c.is_visible,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )
        out.append(d)
    return out


async def create_channel(db: AsyncSession, payload: dict) -> Channel:
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("频道名称不能为空")
    slug = (payload.get("slug") or "").strip().lower() or slugify(name)
    if not SLUG_RE.match(slug):
        raise ValueError("slug 只能包含小写字母、数字和连字符（首尾须为字母/数字）")
    exists = (await db.execute(select(Channel.id).where(Channel.slug == slug))).scalar_one_or_none()
    if exists:
        raise ValueError(f"slug 已存在: {slug}")

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
            raise ValueError("slug 只能包含小写字母、数字和连字符（首尾须为字母/数字）")
        clash = (
            await db.execute(select(Channel.id).where(Channel.slug == slug, Channel.id != channel_id))
        ).scalar_one_or_none()
        if clash:
            raise ValueError(f"slug 已存在: {slug}")
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
