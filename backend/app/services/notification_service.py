"""Centralized notification creation logic with WebSocket push."""

import json
import uuid
from datetime import UTC, datetime

from fastapi import WebSocketDisconnect
from sqlalchemy import func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.notification import Notification

logger = get_logger(__name__)

# Fan-out batch size for announcements (ADM-07). One INSERT per 500 users keeps
# the worker's transactions bounded and the statement count linear in pages,
# not in users. Mirrors the "1万用户 = 1万次往返" problem the in-request loop had.
ANNOUNCEMENT_CHUNK_SIZE = 500


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
    from app.services.retired_features import RETIRED_NOTIFICATION_TYPES, feature_gone

    if type in RETIRED_NOTIFICATION_TYPES:
        feature_gone()
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
        from app.api.v1.notifications import push_to_user

        await push_to_user(
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


async def notify_admins(db: AsyncSession, title: str, message: str, related_url: str | None = None) -> None:
    """Send a notification to every admin user. Best-effort: never raises.

    Used by the pipeline quality gates (transcription failure, translation
    block) to surface quality issues without admins watching logs. Dedup is
    handled by ``create_notification`` (same user+type+related_url unread ->
    updates instead of duplicating). Commits the session so notifications
    persist even when the caller's transaction already committed (the quality-
    gate failure path commits the error state first).
    """
    from sqlalchemy import select

    from app.models.user import RoleType, User

    try:
        admins = (await db.scalars(select(User).where(User.role == RoleType.admin))).all()
        for a in admins:
            await create_notification(
                user_id=a.id,
                type="quality_alert",
                title=title,
                message=message,
                db=db,
                related_url=related_url,
            )
        await db.commit()
    except Exception:
        logger.warning("notify_admins failed", exc_info=True)


async def count_announcement_recipients(db: AsyncSession) -> int:
    """Number of users a broadcast would fan out to (request-path count only).

    The actual per-user rows are written by the Celery task; this is what
    ``POST /admin/announcements`` reports as ``notified_count`` (ADM-07). A few
    sign-ups landing between the count and the fan-out simply mean the task
    notifies more users than reported — the response is a preview, not an
    exactly-once ledger.
    """
    from app.models.user import User

    return int((await db.scalar(select(func.count()).select_from(User))) or 0)


def _announcement_stub(
    notification_id: str,
    user_id: str,
    title: str,
    message: str,
    related_url: str | None,
    created_at: datetime,
) -> Notification:
    """Transient Notification used only to shape the best-effort WS payload."""
    return Notification(
        id=notification_id,
        user_id=user_id,
        type="announcement",
        title=title,
        message=message,
        is_read=False,
        related_url=related_url,
        created_at=created_at,
    )


async def fan_out_announcement(
    db: AsyncSession,
    *,
    title: str,
    message: str,
    related_url: str | None = None,
    chunk_size: int = ANNOUNCEMENT_CHUNK_SIZE,
) -> int:
    """Write one announcement notification per user in bounded chunks (ADM-07).

    Called from ``app.tasks.notification_tasks.broadcast_announcement`` — never
    from an HTTP handler. The request path used to loop over every user doing a
    SELECT + INSERT + WS push inside one transaction; this does keyset-paged
    users (``chunk_size`` per page), one multi-row ``insert()`` per page, and
    commits each page before the best-effort WebSocket push.

    Dedup semantics are the ones ``create_notification`` had for announcements:

    - ``related_url`` set: an existing *unread* notification with the same
      (user, ``announcement``, related_url) is updated in place (title /
      message / timestamp), not duplicated — re-broadcasting the same
      announcement URL refreshes it;
    - ``related_url`` empty: every broadcast inserts a fresh row (a new
      announcement should surface even if a prior one is still unread).

    Returns the number of users processed (inserted + updated).
    """
    from app.models.user import User

    processed = 0
    last_user_id: str | None = None
    while True:
        user_stmt = select(User.id).order_by(User.id).limit(chunk_size)
        if last_user_id is not None:
            user_stmt = user_stmt.where(User.id > last_user_id)
        user_ids = list((await db.scalars(user_stmt)).all())
        if not user_ids:
            break
        last_user_id = user_ids[-1]

        now = datetime.now(UTC)
        existing_by_user: dict[str, str] = {}
        if related_url is not None:
            rows = (
                await db.execute(
                    select(Notification.id, Notification.user_id).where(
                        Notification.user_id.in_(user_ids),
                        Notification.type == "announcement",
                        Notification.related_url == related_url,
                        Notification.is_read == False,
                    )
                )
            ).all()
            existing_by_user = {user_id: notification_id for notification_id, user_id in rows}
            if existing_by_user:
                await db.execute(
                    update(Notification)
                    .where(Notification.id.in_(list(existing_by_user.values())))
                    .values(title=title, message=message, data=None, created_at=now)
                )

        new_user_ids = [user_id for user_id in user_ids if user_id not in existing_by_user]
        new_notifications: list[dict] = [
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": "announcement",
                "title": title,
                "message": message,
                "is_read": False,
                "related_url": related_url,
                "data": None,
                "created_at": now,
            }
            for user_id in new_user_ids
        ]
        if new_notifications:
            await db.execute(insert(Notification), new_notifications)

        # Commit before pushing: a failed WS attempt must not roll back rows the
        # users would otherwise see in the in-app list.
        await db.commit()
        processed += len(user_ids)

        pushes = [(notification["id"], notification["user_id"]) for notification in new_notifications]
        pushes.extend((notification_id, user_id) for user_id, notification_id in existing_by_user.items())
        for notification_id, user_id in pushes:
            await _push_notification(
                _announcement_stub(notification_id, user_id, title, message, related_url, now),
                user_id,
            )

    return processed
