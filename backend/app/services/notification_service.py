"""Centralized notification creation logic with WebSocket push."""

import json
from datetime import UTC, datetime

from fastapi import WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.notification import Notification

logger = get_logger(__name__)


def _make_data(actor_id: str | None = None, **extra) -> str | None:
    """Build a JSON string for the Notification.data column."""
    if not actor_id and not extra:
        return None
    payload: dict = {}
    if actor_id:
        payload["actor_id"] = actor_id
    payload.update(extra)
    return json.dumps(payload, ensure_ascii=False)


def _extract_actor_id(data: str | None) -> str | None:
    """Extract actor_id from the Notification.data JSON column."""
    if not data:
        return None
    try:
        return json.loads(data).get("actor_id")
    except (json.JSONDecodeError, TypeError):
        return None


async def create_notification(
    user_id: str,
    type: str,
    title: str,
    message: str,
    db: AsyncSession,
    related_url: str | None = None,
    actor_id: str | None = None,
) -> Notification:
    """Create a notification for a user and push it via WebSocket.

    Deduplication: if an unread notification with the same user_id, type,
    related_url, AND actor_id already exists, update its timestamp and
    message instead of creating a duplicate. This prevents notification spam
    from repeated actions by the same actor (e.g., like → unlike → re-like).

    Different actors performing the same action on the same target each get
    their own notification — "Alice liked your post" and "Bob liked your post"
    are distinct events.

    If the existing notification is already read, a new one is created so
    the user sees the new activity.

    The caller is responsible for committing the session.

    Race condition note: the dedup check-then-insert is not atomic. A rare
    concurrent call could create a duplicate. This is acceptable because:
    (1) notifications are low-stakes (unlike payments which use with_for_update),
    (2) the status quo is no dedup at all, so occasional duplicates are an
    improvement, and (3) adding row-level locking would add contention on a
    high-write table.
    """
    data_json = _make_data(actor_id=actor_id)

    # Dedup check: look for an existing unread notification with same key
    if related_url is not None:
        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.type == type,
            Notification.related_url == related_url,
            Notification.is_read == False,
        )
        # If actor_id is provided, scope dedup to same actor
        if actor_id is not None:
            # Filter in Python: data is a JSON text column, not queryable
            # with SQLAlchemy without database-specific JSON functions.
            # For PostgreSQL we could use Notification.data['actor_id'].astext == actor_id,
            # but keeping it portable is more important for this project
            # (tests run on SQLite). Filter candidates in Python.
            candidates = (await db.scalars(stmt)).all()
            existing = None
            for c in candidates:
                if _extract_actor_id(c.data) == actor_id:
                    existing = c
                    break
        else:
            # No actor_id — dedup by (user_id, type, related_url) only
            existing = await db.scalar(stmt)

        if existing is not None:
            # Update the existing notification instead of creating a new one
            existing.title = title
            existing.message = message
            existing.data = data_json
            existing.created_at = datetime.now(UTC)
            await db.flush()

            # Push update via WebSocket
            await _push_notification(existing, user_id)
            return existing

    # No existing unread notification — create new
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        related_url=related_url,
        data=data_json,
    )
    db.add(notification)
    await db.flush()

    # Push to WebSocket connections if any are active
    await _push_notification(notification, user_id)

    return notification


async def _push_notification(notification: Notification, user_id: str) -> None:
    """Attempt to push a notification via WebSocket. Best-effort."""
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
    except WebSocketDisconnect:
        # Normal disconnection — client closed the connection. No action needed.
        pass
    except Exception:
        # Unexpected error (malformed JSON, auth issue, etc.) — log with exc_info
        # so persistent failures are visible in monitoring.
        logger.warning(
            "WebSocket push failed for user %s, notification_id=%s, type=%s",
            user_id,
            notification.id,
            notification.type,
            exc_info=True,
        )
