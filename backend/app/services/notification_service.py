"""Centralized notification creation logic with WebSocket push."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.notification import Notification

logger = get_logger(__name__)


async def create_notification(
    user_id: str,
    type: str,
    title: str,
    message: str,
    db: AsyncSession,
    related_url: str | None = None,
) -> Notification:
    """Create a notification for a user and push it via WebSocket.

    Creates the notification in the database and attempts to push it
    to any active WebSocket connections for the user.
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

    # Push to WebSocket connections if any are active
    try:
        from app.api.v1.notifications import ws_manager

        await ws_manager.send_to_user(
            user_id,
            {
                "type": "notification",
                "notification": {
                    "id": notification.id,
                    "type": notification.type,
                    "title": notification.title,
                    "message": notification.message,
                    "is_read": notification.is_read,
                    "related_url": notification.related_url,
                    "created_at": notification.created_at.isoformat() if notification.created_at else None,
                },
            },
        )
    except Exception:
        # WebSocket push is best-effort; don't block notification creation
        # but log so push failures are observable rather than silently swallowed.
        logger.warning("WebSocket push failed for user %s", user_id, exc_info=True)

    return notification
