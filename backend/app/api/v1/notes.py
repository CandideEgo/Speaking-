"""User notes library — one note per video, newest edit first.

The watch page only knows ``GET /videos/{id}/note``. A library surface needs
the cross-video list ("我的笔记"), so this router joins UserNote -> Video and
returns the card-level facts plus an ``available`` flag that matches the
sentence-favorites rule (access + published + not offline).
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.favorite import UserNote
from app.models.user import User
from app.models.video import Video
from app.schemas.pagination import paginated
from app.services.video_access import check_video_access

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("")
@rate_limit("30/minute")
async def list_notes(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All of the user's notes with enough video info to reopen the source."""
    total = (await db.execute(select(func.count(UserNote.id)).where(UserNote.user_id == current_user.id))).scalar_one()
    rows = (
        await db.execute(
            select(UserNote, Video)
            .join(Video, UserNote.video_id == Video.id)
            .where(UserNote.user_id == current_user.id)
            .order_by(UserNote.updated_at.desc(), UserNote.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    from app.services.channel_service import channel_slugs_for

    slug_map = await channel_slugs_for(db, [video for _, video in rows])
    items = []
    for note, video in rows:
        available = check_video_access(video, current_user) and video.is_published and video.storage_mode != "offline"
        items.append(
            {
                "id": note.id,
                "video_id": video.id,
                "title": video.title,
                "title_zh": video.title_zh,
                "thumbnail_url": video.thumbnail_url if available else None,
                "channel_name": video.channel_name,
                "channel_slug": slug_map.get(video.channel_ref) if video.channel_ref else None,
                "content": note.content,
                "created_at": note.created_at,
                "updated_at": note.updated_at,
                "available": available,
            }
        )
    return paginated(items, page=page, page_size=page_size, total=total)
