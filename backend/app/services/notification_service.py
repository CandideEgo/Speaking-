"""Centralized notification creation logic."""

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import Notification


async def create_notification(
    user_id: str,
    type: str,
    title: str,
    message: str,
    db: AsyncSession,
    related_url: str | None = None,
) -> Notification:
    """Create a notification for a user and return the ORM instance.

    The caller is responsible for committing the session.
    """
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        related_url=related_url,
    )
    db.add(notification)
    await db.flush()
    return notification
