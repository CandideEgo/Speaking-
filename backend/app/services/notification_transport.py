"""Best-effort notification transport shared by HTTP and worker processes."""

import asyncio
import json
import uuid
from contextlib import suppress

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from app.services.retired_features import RETIRED_NOTIFICATION_TYPES

logger = structlog.get_logger(__name__)

# Cross-worker fan-out. Each process subscribes to this one channel and
# delivers to the sockets it holds; the publishing process also delivers
# locally and tags the message with its instance id so its own subscriber
# skips the copy it already delivered.
NOTIFICATIONS_CHANNEL = "notifications:push"
_INSTANCE_ID = uuid.uuid4().hex
_subscriber_task: asyncio.Task | None = None


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
        notification = message.get("notification")
        if isinstance(notification, dict) and notification.get("type") in RETIRED_NOTIFICATION_TYPES:
            return
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


async def push_to_user(user_id: str, message: dict) -> None:
    """Deliver a message to a user's sockets on every worker.

    Local delivery happens first so a Redis outage still reaches sockets
    held by this process (INV-002: notifications are best-effort and Redis
    must not block the user-facing flow). Redis Pub/Sub fans the message out
    to the other workers' subscribers.
    """
    await ws_manager.send_to_user(user_id, message)
    try:
        from app.core.redis import get_redis

        redis = get_redis()
        await redis.publish(
            NOTIFICATIONS_CHANNEL,
            json.dumps(
                {"origin": _INSTANCE_ID, "user_id": user_id, "message": message},
                ensure_ascii=False,
            ),
        )
    except Exception:
        logger.warning("notification_publish_failed", user_id=user_id, exc_info=True)


async def _notification_subscriber_loop() -> None:
    """Subscribe to the cross-worker channel and deliver to local sockets.

    Reconnects with a 1s backoff on any Redis error; cancellation is the
    normal shutdown path and propagates.
    """
    while True:
        pubsub = None
        try:
            from app.core.redis import get_redis

            redis = get_redis()
            pubsub = redis.pubsub()
            await pubsub.subscribe(NOTIFICATIONS_CHANNEL)
            async for raw in pubsub.listen():
                if raw.get("type") != "message":
                    continue
                try:
                    payload = json.loads(raw["data"])
                except (TypeError, ValueError):
                    continue
                if payload.get("origin") == _INSTANCE_ID:
                    continue
                user_id = payload.get("user_id")
                message = payload.get("message")
                if user_id and isinstance(message, dict):
                    await ws_manager.send_to_user(user_id, message)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("notification_subscriber_reconnecting", exc_info=True)
            await asyncio.sleep(1)
        finally:
            if pubsub is not None:
                with suppress(Exception):
                    await pubsub.unsubscribe(NOTIFICATIONS_CHANNEL)
                with suppress(Exception):
                    if hasattr(pubsub, "aclose"):
                        await pubsub.aclose()
                    else:
                        await pubsub.close()


def start_notification_subscriber() -> asyncio.Task:
    """Start the per-process subscriber task (idempotent)."""
    global _subscriber_task
    if _subscriber_task is None or _subscriber_task.done():
        _subscriber_task = asyncio.create_task(_notification_subscriber_loop())
    return _subscriber_task


async def stop_notification_subscriber() -> None:
    """Cancel the subscriber task on shutdown."""
    global _subscriber_task
    task = _subscriber_task
    _subscriber_task = None
    if task is not None:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
