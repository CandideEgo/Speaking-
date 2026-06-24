from datetime import UTC, datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decode_token
from app.core.token_blacklist import is_token_blacklisted
from app.models.user import PlanType, RoleType, User
from app.models.video import Video

security = HTTPBearer(auto_error=False)
settings = get_settings()


def _to_aware_utc(dt: datetime) -> datetime:
    """Return ``dt`` as a timezone-aware UTC datetime.

    Defensive helper: SQLAlchemy returns aware datetimes for ``DateTime(timezone=True)``
    columns on Postgres, but naive ones on SQLite (and naive values may appear in
    hand-crafted rows). Comparing a naive ``plan_expires_at`` against
    ``datetime.now(UTC)`` raises TypeError, so normalise before comparing.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _token_issued_before_password_change(payload: dict, user: User) -> bool:
    """Return True if the token was issued before the user's last password change.

    Used to invalidate sessions after a password reset/change: tokens minted
    before ``password_changed_at`` are treated as stale. Tokens without an
    ``iat`` claim (issued before this feature shipped) are allowed through to
    avoid a mass logout on deploy.

    A 2-second leeway absorbs sub-second clock differences and the fact that
    JWT ``iat`` is encoded as an integer (truncated) while ``password_changed_at``
    retains microsecond precision — otherwise a token issued in the same second
    as the password change could be spuriously rejected.
    """
    iat = payload.get("iat")
    if iat is None or user.password_changed_at is None:
        return False
    issued_at = datetime.fromtimestamp(float(iat), tz=UTC)
    changed_at = _to_aware_utc(user.password_changed_at)
    return issued_at + timedelta(seconds=2) < changed_at


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # Prevent refresh tokens from being used as access tokens
    if payload.get("type") not in ("access", None):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

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

    # Reject tokens issued before the last password change/reset.
    if _token_issued_before_password_change(payload, user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired due to password change. Please log in again.",
        )

    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if payload is None:
        return None

    # Prevent refresh tokens from being used as access tokens
    if payload.get("type") not in ("access", None):
        return None

    # Token blacklist check (skip if feature disabled)
    if settings.jwt_blacklist_enabled and await is_token_blacklisted(payload.get("jti")):
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    # Reject tokens issued before the last password change/reset.
    if user is not None and _token_issued_before_password_change(payload, user):
        return None

    return user


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
        and _to_aware_utc(current_user.plan_expires_at) < datetime.now(UTC)
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
