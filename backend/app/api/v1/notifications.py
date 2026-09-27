"""Notification route handlers — REST API + WebSocket for real-time push."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import commit_refresh, get_db
from app.core.limiter import rate_limit
from app.core.security import decode_token
from app.core.token_blacklist import is_token_blacklisted
from app.models.notification import Notification
from app.models.preferences import UserPreferences
from app.models.user import User
from app.schemas.notification import (
    DEFAULT_NOTIFICATION_PREFS,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    UnreadCountResponse,
)
from app.schemas.pagination import PaginatedResponse, PaginationParams, paginated

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── WebSocket connection manager ──────────────────────────────────────


class ConnectionManager:
    """Manages active WebSocket connections per user."""

    def __init__(self):
        # user_id -> list of WebSocket connections (a user may have multiple tabs)
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket, subprotocol: str | None = None):
        await websocket.accept(subprotocol=subprotocol)
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        """Drop a socket from a user's list, tolerating a repeat call.

        Two callers race to clean up the same socket — ``send_to_user``'s
        cleanup pass and the socket's own ``WebSocketDisconnect`` handler — so
        the second call must be a no-op instead of raising.
        """
        connections = self._connections.get(user_id)
        if not connections:
            return
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, message: dict):
        """Send a JSON message to all of a user's active connections."""
        # Snapshot the list: it is mutated by other tasks (a socket's own
        # endpoint cleaning up) while this loop is suspended on ``send_json``,
        # and a removal mid-iteration makes the iterator step over the socket
        # that shifted into the vacated slot — a live connection misses the
        # message with no error anywhere.
        connections = list(self._connections.get(user_id, []))
        disconnected = []
        unexpected_errors = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except WebSocketDisconnect:
                # Normal disconnection — mark for cleanup
                disconnected.append(ws)
            except Exception:
                # Unexpected error (malformed JSON, auth issue, etc.)
                # Mark for cleanup and record for logging
                disconnected.append(ws)
                unexpected_errors.append(type(ws).__name__)
        # Clean up disconnected sockets
        for ws in disconnected:
            self.disconnect(user_id, ws)
        # Log unexpected errors so persistent failures are visible
        if unexpected_errors:
            import logging

            logging.warning(
                "WebSocket push had %d unexpected error(s) for user %s: %s",
                len(unexpected_errors),
                user_id,
                unexpected_errors,
            )


# Singleton instance
ws_manager = ConnectionManager()


# ── WebSocket endpoint ────────────────────────────────────────────────

# The browser sends the JWT as a WebSocket subprotocol — `["bearer", <token>]`
# — instead of a query parameter, because query strings end up in proxy and
# uvicorn access logs. RFC 6455 requires the server to echo one of the
# client's requested subprotocols, so the handshake echoes the generic
# ``bearer`` marker and never the token itself.
BEARER_SUBPROTOCOL = "bearer"

# The frontend mirrors its access token into this cookie (see frontend
# src/lib/authHelpers.ts, AUTH_COOKIE_NAME) as a fallback for proxies that
# drop the Sec-WebSocket-Protocol header.
AUTH_COOKIE_NAME = "seeword_token"


def _requested_subprotocols(websocket: WebSocket) -> list[str]:
    header = websocket.headers.get("sec-websocket-protocol", "")
    return [part.strip() for part in header.split(",") if part.strip()]


def _ws_token(websocket: WebSocket) -> str | None:
    """Extract the access token from the handshake: subprotocol first, then cookie."""
    protocols = _requested_subprotocols(websocket)
    if BEARER_SUBPROTOCOL in protocols:
        index = protocols.index(BEARER_SUBPROTOCOL)
        if index + 1 < len(protocols):
            return protocols[index + 1]
    return websocket.cookies.get(AUTH_COOKIE_NAME)


@router.websocket("/ws")
async def notification_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time notifications.

    Authenticates on the JWT carried in the ``bearer`` subprotocol (or the
    auth cookie) and then pushes notification events as JSON messages.
    """
    protocols = _requested_subprotocols(websocket)
    token = _ws_token(websocket)
    payload = decode_token(token) if token else None
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Verify token type is access (not refresh)
    if payload.get("type") == "refresh":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Check token blacklist (same as get_current_user)
    settings = get_settings()
    if settings.jwt_blacklist_enabled and await is_token_blacklisted(payload.get("jti")):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Check if user is banned (same as get_current_user)
    from app.core.database import get_session_maker

    async with get_session_maker()() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        ws_user = result.scalar_one_or_none()
    if not ws_user or ws_user.is_banned:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect(
        user_id,
        websocket,
        subprotocol=BEARER_SUBPROTOCOL if BEARER_SUBPROTOCOL in protocols else None,
    )
    try:
        # Send initial unread count
        # (We can't easily get a db session here in WebSocket,
        #  so we just keep the connection alive and push events)
        while True:
            # Keep connection alive — wait for any client message (ping/pong)
            data = await websocket.receive_text()
            # Client can send "ping" for keepalive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        # Unconditional: an error other than a clean disconnect (a socket the
        # push loop dropped, or cancellation on shutdown) must not leave the
        # socket registered in _connections.
        ws_manager.disconnect(user_id, websocket)


# ── REST API endpoints ────────────────────────────────────────────────


@router.get("", response_model=PaginatedResponse[NotificationResponse])
@rate_limit("30/minute")
async def list_notifications(
    request: Request,
    type_filter: str | None = Query(None, alias="type", description="Filter by notification type"),
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List current user's notifications, newest first, optionally by type."""
    filters = [Notification.user_id == current_user.id]
    if type_filter:
        filters.append(Notification.type == type_filter)
    total = (await db.execute(select(func.count()).where(*filters))).scalar() or 0

    result = await db.execute(
        select(Notification)
        .where(*filters)
        .order_by(Notification.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.page_size)
    )
    return paginated(result.scalars().all(), pagination, total=total)


@router.get("/unread-count", response_model=UnreadCountResponse)
@rate_limit("30/minute")
async def unread_count(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the number of unread notifications for the current user."""
    result = await db.execute(
        select(func.count()).where(Notification.user_id == current_user.id, Notification.is_read == False)
    )
    count = result.scalar() or 0
    return UnreadCountResponse(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
@rate_limit("30/minute")
async def mark_as_read(
    request: Request,
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a single notification as read. Only the owner can do this."""
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your notification")
    notification.is_read = True
    await commit_refresh(db, notification)
    return notification


@router.patch("/read-all", response_model=UnreadCountResponse)
@rate_limit("10/minute")
async def mark_all_as_read(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all of the current user's notifications as read."""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return UnreadCountResponse(count=0)


# ── Notification preferences ──────────────────────────────────────────

# Default preferences are defined once in app.schemas.notification
# (DEFAULT_NOTIFICATION_PREFS) and shared with the response schema so the two
# cannot drift.


@router.get("/preferences")
@rate_limit("20/minute")
async def get_notification_preferences(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's notification preferences."""
    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    pref = result.scalar_one_or_none()

    if not pref or not pref.notification_preferences:
        return DEFAULT_NOTIFICATION_PREFS.copy()

    # Merge with defaults (in case new keys were added)
    merged = DEFAULT_NOTIFICATION_PREFS.copy()
    if isinstance(pref.notification_preferences, dict):
        merged.update(pref.notification_preferences)
    return merged


@router.put("/preferences")
@rate_limit("10/minute")
async def update_notification_preferences(
    request: Request,
    data: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's notification preferences (upsert)."""
    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    pref = result.scalar_one_or_none()

    if not pref:
        pref = UserPreferences(user_id=current_user.id, notification_preferences=DEFAULT_NOTIFICATION_PREFS.copy())
        db.add(pref)

    # Merge updates into existing preferences
    current = pref.notification_preferences or DEFAULT_NOTIFICATION_PREFS.copy()
    if not isinstance(current, dict):
        current = DEFAULT_NOTIFICATION_PREFS.copy()
    update_data = data.model_dump(exclude_none=True)
    current.update(update_data)
    pref.notification_preferences = current

    await commit_refresh(db, pref)

    return current
