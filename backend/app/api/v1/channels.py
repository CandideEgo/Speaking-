"""Channels API — official curated video channels (ADR-0014).

Author pages - every scraped author gets one, auto-created at ingest
(ADR-0014 rev. 2026-08-30).

Public:  GET /channels (paginated; curated rows first, auto author pages by
video count), GET /channels/{slug} (anonymous-friendly, like
recommendations). Admin: CRUD under /channels/admin* plus a batch attach
endpoint. Channels are orthogonal to the topic-tag recommendation dimension.

NOTE: no ``from __future__ import annotations`` here on purpose — the
@rate_limit decorator (slowapi) wraps endpoints with functools.wraps, and
string annotations would silently break pydantic body resolution (same
constraint as exams.py).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.channel import Channel
from app.models.user import User
from app.models.video import Video
from app.services import channel_service

router = APIRouter(prefix="/channels", tags=["channels"])


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------


@router.get("")
@rate_limit("30/minute")
async def list_channels(
    request: Request,
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(50, ge=4, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Visible non-empty channels (curated first, auto author pages by video
    count) as a paginated envelope."""
    return await channel_service.list_public_channels(db, page, page_size)


@router.get("/{slug}")
@rate_limit("30/minute")
async def channel_detail(
    request: Request,
    slug: str,
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(20, ge=4, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Channel detail + paginated published videos inside it."""
    detail = await channel_service.get_channel_detail(db, slug, page, page_size)
    if detail is None:
        raise HTTPException(status_code=404, detail="频道不存在")
    return detail


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class ChannelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=120)
    description: str | None = None
    cover_url: str | None = Field(None, max_length=2000)
    upstream_channel_id: str | None = Field(None, max_length=64)
    sort_order: int = 0
    is_visible: bool = True


class ChannelUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=120)
    description: str | None = None
    cover_url: str | None = Field(None, max_length=2000)
    upstream_channel_id: str | None = Field(None, max_length=64)
    sort_order: int | None = None
    is_visible: bool | None = None


class ChannelAttachVideos(BaseModel):
    video_ids: list[str] = Field(..., min_length=1)


@router.get("/admin/all")
@rate_limit("30/minute")
async def admin_list_channels(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """All channels including hidden ones. Admin only."""
    return {"items": await channel_service.list_admin_channels(db)}


@router.post("/admin", status_code=status.HTTP_201_CREATED)
@rate_limit("30/minute")
async def admin_create_channel(
    request: Request,
    payload: ChannelCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a channel; registering upstream_channel_id auto-attaches
    existing videos scraped from that upstream channel."""
    try:
        channel = await channel_service.create_channel(db, payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.commit()
    # Videos may have just been auto-attached - feed cards embed the link.
    attached_ids = list((await db.execute(select(Video.id).where(Video.channel_ref == channel.id))).scalars())
    if attached_ids:
        try:
            await channel_service.invalidate_channel_caches(attached_ids)
        except Exception:
            import logging

            logging.getLogger(__name__).warning("channel create cache invalidation failed", exc_info=True)
    return {"id": channel.id, "slug": channel.slug, "name": channel.name}


@router.patch("/admin/{channel_id}")
@rate_limit("30/minute")
async def admin_update_channel(
    request: Request,
    channel_id: str,
    payload: ChannelUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Partial channel update. Admin only."""
    try:
        channel = await channel_service.update_channel(db, channel_id, payload.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if channel is None:
        raise HTTPException(status_code=404, detail="频道不存在")
    await db.commit()
    return {"id": channel.id, "slug": channel.slug, "name": channel.name}


@router.delete("/admin/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
@rate_limit("30/minute")
async def admin_delete_channel(
    request: Request,
    channel_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a channel; member videos keep living with channel_ref=NULL."""
    deleted = await channel_service.delete_channel(db, channel_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="频道不存在")
    await db.commit()
    return None


@router.post("/admin/{channel_id}/videos")
@rate_limit("30/minute")
async def admin_attach_videos(
    request: Request,
    channel_id: str,
    payload: ChannelAttachVideos,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Set this channel as the curated home for the given videos (overwrite)."""
    channel = await db.get(Channel, channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="频道不存在")
    result = await db.execute(update(Video).where(Video.id.in_(payload.video_ids)).values(channel_ref=channel_id))
    await db.commit()
    try:
        await channel_service.invalidate_channel_caches(payload.video_ids)
    except Exception:
        import logging

        logging.getLogger(__name__).warning("channel attach cache invalidation failed", exc_info=True)
    return {"attached": result.rowcount}
