from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import decode_token
from app.core.token_blacklist import is_token_blacklisted
from app.core.config import get_settings
from app.models.user import User, RoleType, PlanType
from app.models.video import Video

security = HTTPBearer(auto_error=False)
settings = get_settings()


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # Token blacklist check (skip if feature disabled)
    if settings.jwt_blacklist_enabled and await is_token_blacklisted(payload.get("jti")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if payload is None:
        return None

    # Token blacklist check (skip if feature disabled)
    if settings.jwt_blacklist_enabled and await is_token_blacklisted(payload.get("jti")):
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != RoleType.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def require_pro_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency that ensures the current user has an active Pro subscription.

    Checks plan expiry at the point of use rather than during token validation,
    so get_current_user remains a read-only dependency with no database side effects.
    """
    if current_user.plan == PlanType.free:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pro subscription required.",
        )
    if (
        current_user.plan == PlanType.pro
        and current_user.plan_expires_at
        and current_user.plan_expires_at < datetime.now(timezone.utc)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pro subscription has expired.",
        )
    return current_user


def check_video_access(video: Video, current_user: User | None) -> bool:
    """Check whether a user can access a video.

    Access rules:
    - Official videos are public (anyone can access).
    - Non-official (user-submitted) videos require the viewer to be the owner.

    Returns True if access is allowed, False otherwise.
    """
    if video.is_official:
        return True
    if current_user is not None and video.user_id == current_user.id:
        return True
    return False


async def require_video_access(
    video_id: str,
    current_user: User | None,
    db: AsyncSession,
) -> Video:
    """Fetch a video and enforce access control.

    Raises HTTPException 404 if the video does not exist or the user lacks access.
    Returns the Video ORM object on success.

    Usage in route handlers:
        video = await require_video_access(video_id, current_user, db)
    """
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if not check_video_access(video, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return video
