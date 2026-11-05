"""Shared opt-in gate for HTTP, worker and external tools."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.models.user import User
from app.models.v2_runtime import TeachingAccessGrant


async def require_access(db: AsyncSession, user_id: str, flag: str) -> None:
    settings = get_settings()
    user = await db.get(User, user_id)
    if user is None or user.is_banned or user.deletion_requested_at:
        raise AppError(403, "FORBIDDEN", "账号暂不可使用教学功能")
    bootstrap = {value.strip() for value in settings.teaching_allowed_user_ids.split(",") if value.strip()}
    allowed = user_id in bootstrap or await db.get(TeachingAccessGrant, user_id) is not None
    if not getattr(settings, flag, False) or not allowed:
        raise AppError(503, "SERVICE_UNAVAILABLE", "教学功能暂未开放")
