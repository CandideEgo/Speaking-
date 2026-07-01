"""Notification route handlers — REST API + WebSocket for real-time push."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.core.security import decode_token
from app.core.token_blacklist import is_token_blacklisted
from app.models.notification import Notification
from app.models.preferences import UserPreferences
from app.models.user import User
from app.schemas.notification import (
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── WebSocket connection manager ──────────────────────────────────────


class ConnectionManager:
    """Manages active WebSocket connections per user."""

    def __init__(self):
        # user_id -> list of WebSocket connections (a user may have multiple tabs)
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self._connections:
            self._connections[user_id].remove(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        """Send a JSON message to all of a user's active connections."""
        connections = self._connections.get(user_id, [])
        disconnected = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        # Clean up disconnected sockets
        for ws in disconnected:
            self.disconnect(user_id, ws)


# Singleton instance
ws_manager = ConnectionManager()


# ── WebSocket endpoint ────────────────────────────────────────────────


@router.websocket("/ws")
async def notification_websocket(
    websocket: WebSocket,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time notifications.

    Accepts a JWT token as a query parameter for authentication.
    Sends notification events as JSON messages when they are created.
    """
    # Authenticate via token query param
    payload = decode_token(token)
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

    await ws_manager.connect(user_id, websocket)
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
        ws_manager.disconnect(user_id, websocket)


# ── REST API endpoints ────────────────────────────────────────────────


@router.get("", response_model=list[NotificationResponse])
@rate_limit("30/minute")
async def list_notifications(
    request: Request,
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List current user's notifications, newest first."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


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
    await db.commit()
    await db.refresh(notification)
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

# Default notification preferences
DEFAULT_PREFS = {
    "email_notifications": True,
    "push_notifications": True,
    "streak_reminder": True,
    "weekly_report": True,
    "community_updates": True,
    "new_follower": True,
    "comment_reply": True,
}


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
        return DEFAULT_PREFS.copy()

    # Merge with defaults (in case new keys were added)
    merged = DEFAULT_PREFS.copy()
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
        pref = UserPreferences(user_id=current_user.id, notification_preferences=DEFAULT_PREFS.copy())
        db.add(pref)

    # Merge updates into existing preferences
    current = pref.notification_preferences or DEFAULT_PREFS.copy()
    if not isinstance(current, dict):
        current = DEFAULT_PREFS.copy()
    update_data = data.model_dump(exclude_none=True)
    current.update(update_data)
    pref.notification_preferences = current

    await db.commit()
    await db.refresh(pref)

    return current
