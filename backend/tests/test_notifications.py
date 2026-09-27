"""Tests for the notifications API (/api/v1/notifications)."""

from fastapi import WebSocketDisconnect, status
from httpx import AsyncClient

from app.models.notification import Notification
from tests.conftest import TestSessionLocal


class TestListNotifications:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/v1/notifications")).status_code == 401

    async def test_empty_for_new_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/notifications", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    async def test_returns_notifications_newest_first(self, client: AsyncClient, auth_headers: dict):
        from datetime import UTC, datetime, timedelta

        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        base = datetime.now(UTC)
        async with TestSessionLocal() as db:
            db.add(
                Notification(user_id=me["id"], type="system", title="First", created_at=base - timedelta(seconds=10))
            )
            db.add(Notification(user_id=me["id"], type="system", title="Second", created_at=base))
            await db.commit()

        resp = await client.get("/api/v1/notifications", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 2
        # newest first — "Second" has the later timestamp
        assert items[0]["title"] == "Second"
        assert items[1]["title"] == "First"

    async def test_filters_by_type(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            db.add(Notification(user_id=me["id"], type="video_ready", title="Video"))
            db.add(Notification(user_id=me["id"], type="pro_expiring", title="Pro"))
            db.add(Notification(user_id=me["id"], type="achievement_unlocked", title="Badge"))
            await db.commit()

        resp = await client.get("/api/v1/notifications?type=video_ready", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert [i["title"] for i in body["items"]] == ["Video"]
        assert body["total"] == 1

        # No filter — every type comes back
        unfiltered = (await client.get("/api/v1/notifications", headers=auth_headers)).json()
        assert unfiltered["total"] == 3

        # A type nobody used yet is an empty list, not an error
        empty = (await client.get("/api/v1/notifications?type=streak_warning", headers=auth_headers)).json()
        assert empty["items"] == []
        assert empty["total"] == 0


class TestUnreadCount:
    async def test_zero_for_new_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    async def test_counts_only_unread(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            db.add(Notification(user_id=me["id"], type="system", title="A", is_read=False))
            db.add(Notification(user_id=me["id"], type="system", title="B", is_read=False))
            db.add(Notification(user_id=me["id"], type="system", title="C", is_read=True))
            await db.commit()

        resp = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
        assert resp.json()["count"] == 2


class TestMarkAsRead:
    async def test_mark_single_read(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            n = Notification(user_id=me["id"], type="system", title="Unread")
            db.add(n)
            await db.commit()
            await db.refresh(n)
            nid = n.id

        resp = await client.patch(f"/api/v1/notifications/{nid}/read", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["is_read"] is True

        # Unread count now 0
        count = (await client.get("/api/v1/notifications/unread-count", headers=auth_headers)).json()
        assert count["count"] == 0

    async def test_cannot_mark_other_users_notification(self, client: AsyncClient, auth_headers: dict):
        # Create a notification owned by a *different* user
        async with TestSessionLocal() as db:
            from app.models.user import PlanType, RoleType, User

            other = User(
                phone="13800138005",
                hashed_password="x",
                name="Other",
                plan=PlanType.free,
                role=RoleType.user,
            )
            db.add(other)
            await db.commit()
            await db.refresh(other)
            n = Notification(user_id=other.id, type="system", title="Not yours")
            db.add(n)
            await db.commit()
            await db.refresh(n)
            nid = n.id

        resp = await client.patch(f"/api/v1/notifications/{nid}/read", headers=auth_headers)
        assert resp.status_code == 403

    async def test_mark_nonexistent_returns_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch("/api/v1/notifications/nonexistent/read", headers=auth_headers)
        assert resp.status_code == 404


class TestMarkAllAsRead:
    async def test_marks_all(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            for i in range(3):
                db.add(Notification(user_id=me["id"], type="system", title=f"N{i}"))
            await db.commit()

        resp = await client.patch("/api/v1/notifications/read-all", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

        # All listed notifications are read
        items = (await client.get("/api/v1/notifications", headers=auth_headers)).json()["items"]
        assert all(n["is_read"] for n in items)


class TestPreferences:
    async def test_get_default_preferences(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/notifications/preferences", headers=auth_headers)
        assert resp.status_code == 200
        prefs = resp.json()
        # Defaults from the route
        assert prefs["push_notifications"] is True
        assert prefs["streak_reminder"] is True

    async def test_update_preferences(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(
            "/api/v1/notifications/preferences",
            headers=auth_headers,
            json={"weekly_report": False, "comment_reply": False},
        )
        assert resp.status_code == 200
        prefs = resp.json()
        assert prefs["weekly_report"] is False
        assert prefs["comment_reply"] is False
        # Untouched keys preserved
        assert prefs["push_notifications"] is True

    async def test_preferences_persist(self, client: AsyncClient, auth_headers: dict):
        await client.put(
            "/api/v1/notifications/preferences",
            headers=auth_headers,
            json={"new_follower": False},
        )
        resp = await client.get("/api/v1/notifications/preferences", headers=auth_headers)
        assert resp.json()["new_follower"] is False


class TestWebSocketPushErrorHandling:
    """Tests for WebSocket push error handling (Phase 0.1 fix)."""

    async def test_websocket_disconnect_is_silently_cleaned(self, client: AsyncClient, auth_headers: dict):
        """WebSocketDisconnect should be silently cleaned up without logging."""
        from app.api.v1.notifications import ConnectionManager, ws_manager

        # Create a mock WebSocket that raises WebSocketDisconnect on send_json
        class MockWS:
            async def send_json(self, data):
                raise WebSocketDisconnect()

        mock_ws = MockWS()
        ws_manager._connections["test-user"] = [mock_ws]

        # Should not raise — disconnect is silently handled
        await ws_manager.send_to_user("test-user", {"type": "test"})

        # Connection should be removed
        assert "test-user" not in ws_manager._connections

    async def test_unexpected_error_is_logged(self, client: AsyncClient, auth_headers: dict, caplog):
        """Unexpected errors during push should be logged with error details."""
        from app.api.v1.notifications import ConnectionManager, ws_manager

        class MockWS:
            async def send_json(self, data):
                raise ValueError("malformed JSON")

        mock_ws = MockWS()
        ws_manager._connections["test-user"] = [mock_ws]

        await ws_manager.send_to_user("test-user", {"type": "test"})

        # Connection should be removed
        assert "test-user" not in ws_manager._connections
        # Should have logged a warning with error details
        import logging

        assert any(
            "unexpected error" in record.message.lower() or "WebSocket push had" in record.message
            for record in caplog.records
        )


class TestConnectionManagerListMutation:
    """The connection list is mutated by *other* tasks while a push is in
    flight: a socket's own endpoint runs its ``WebSocketDisconnect`` cleanup
    concurrently with the broadcaster's.  Both directions of that interleaving
    used to misbehave."""

    async def test_a_concurrent_cleanup_does_not_skip_a_live_socket(self):
        """Iterating the live list means a concurrent removal shifts the tail
        left, and the iterator then steps *over* the socket that moved into the
        vacated slot — a live connection silently misses the message."""
        from app.api.v1.notifications import ws_manager

        sent: list[str] = []

        class MockWS:
            def __init__(self, name: str) -> None:
                self.name = name

            async def send_json(self, data):
                sent.append(self.name)
                if self.name == "a":
                    # "a"'s endpoint hits WebSocketDisconnect and cleans up
                    # mid-broadcast — exactly the reachable interleaving.
                    ws_manager.disconnect("mutate-user", self)

        ws_a, ws_b, ws_c = MockWS("a"), MockWS("b"), MockWS("c")
        ws_manager._connections["mutate-user"] = [ws_a, ws_b, ws_c]
        try:
            await ws_manager.send_to_user("mutate-user", {"type": "test"})
            assert sent == ["a", "b", "c"]
        finally:
            ws_manager._connections.pop("mutate-user", None)

    async def test_cleanup_running_twice_is_a_no_op(self):
        """``send_to_user``'s cleanup and the socket's own endpoint cleanup both
        run for the same socket; the second one must not raise."""
        from app.api.v1.notifications import ws_manager

        class MockWS:
            async def send_json(self, data):
                raise WebSocketDisconnect()

        class HealthyMockWS:
            async def send_json(self, data):
                return None

        ws_dying, ws_alive = MockWS(), HealthyMockWS()
        ws_manager._connections["twice-user"] = [ws_dying, ws_alive]
        try:
            # Broadcaster cleans up the dying socket; the entry survives for ws_alive.
            await ws_manager.send_to_user("twice-user", {"type": "test"})
            assert ws_manager._connections["twice-user"] == [ws_alive]

            # The dying socket's own endpoint now runs its cleanup → must be a no-op.
            ws_manager.disconnect("twice-user", ws_dying)
            assert ws_manager._connections["twice-user"] == [ws_alive]

            # And a third time, for good measure.
            ws_manager.disconnect("twice-user", ws_dying)
            assert ws_manager._connections["twice-user"] == [ws_alive]
        finally:
            ws_manager._connections.pop("twice-user", None)

    async def test_cleanup_is_a_no_op_for_an_unknown_user(self):
        from app.api.v1.notifications import ws_manager

        class MockWS:
            async def send_json(self, data):
                return None

        ws_manager.disconnect("never-connected-user", MockWS())  # must not raise
        assert "never-connected-user" not in ws_manager._connections


class TestNotificationDedup:
    """Tests for actor-aware notification deduplication."""

    async def test_same_actor_same_target_dedupes(self, client: AsyncClient, auth_headers: dict):
        """Same actor repeating the same action updates the existing notification."""
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            from app.services.notification_service import create_notification

            n1 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="用户A 赞了你的帖子",
                db=db,
                related_url="/videos/123",
                actor_id="actor-a",
            )
            await db.commit()
            first_id = n1.id

            # Same actor, same target — should update, not create
            n2 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="用户A 赞了你的帖子",
                db=db,
                related_url="/videos/123",
                actor_id="actor-a",
            )
            await db.commit()

            assert n2.id == first_id

    async def test_different_actors_same_target_creates_separate(self, client: AsyncClient, auth_headers: dict):
        """Different actors on the same target each get their own notification."""
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            from app.services.notification_service import create_notification

            n1 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="用户A 赞了你的帖子",
                db=db,
                related_url="/videos/123",
                actor_id="actor-a",
            )
            n2 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="用户B 赞了你的帖子",
                db=db,
                related_url="/videos/123",
                actor_id="actor-b",
            )
            await db.commit()

            assert n1.id != n2.id

    async def test_read_notification_allows_new(self, client: AsyncClient, auth_headers: dict):
        """After reading, a new notification from the same actor is created."""
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            from app.services.notification_service import create_notification

            n1 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="用户A 赞了你的帖子",
                db=db,
                related_url="/videos/456",
                actor_id="actor-a",
            )
            n1.is_read = True
            await db.commit()

            # Same actor after read — new notification
            n2 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="用户A 赞了你的帖子",
                db=db,
                related_url="/videos/456",
                actor_id="actor-a",
            )
            await db.commit()

            assert n2.id != n1.id

    async def test_no_related_url_always_creates(self, client: AsyncClient, auth_headers: dict):
        """Notifications without related_url are never deduped."""
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            from app.services.notification_service import create_notification

            n1 = await create_notification(
                user_id=me["id"],
                type="system",
                title="系统通知",
                message="第一条",
                db=db,
                related_url=None,
                actor_id="system",
            )
            n2 = await create_notification(
                user_id=me["id"],
                type="system",
                title="系统通知",
                message="第二条",
                db=db,
                related_url=None,
                actor_id="system",
            )
            await db.commit()

            assert n1.id != n2.id

    async def test_no_actor_id_dedupes_by_key_only(self, client: AsyncClient, auth_headers: dict):
        """Without actor_id, dedup uses (user_id, type, related_url) only."""
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            from app.services.notification_service import create_notification

            n1 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="有人 赞了你的帖子",
                db=db,
                related_url="/videos/789",
            )
            await db.commit()

            # No actor_id — same key dedupes even though "different actor"
            n2 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="另一个人 赞了你的帖子",
                db=db,
                related_url="/videos/789",
            )
            await db.commit()

            assert n2.id == n1.id

    async def test_actor_id_stored_in_data(self, client: AsyncClient, auth_headers: dict):
        """actor_id is stored in the Notification.data JSON field."""
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            from app.services.notification_service import create_notification

            n = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="用户A 赞了你的帖子",
                db=db,
                related_url="/videos/100",
                actor_id="actor-xyz",
            )
            await db.commit()

            import json

            data = json.loads(n.data)
            assert data["actor_id"] == "actor-xyz"


class _FakeWebSocket:
    """Minimal stand-in for the handshake surface the WS endpoint touches."""

    def __init__(
        self,
        protocols: str | None = None,
        cookie: str | None = None,
        query_token: str | None = None,
    ) -> None:
        self.headers = {"sec-websocket-protocol": protocols} if protocols else {}
        self.cookies = {"seeword_token": cookie} if cookie else {}
        self.query_string = f"token={query_token}".encode() if query_token else b""
        self.accepted = False
        self.accepted_subprotocol: str | None = None
        self.close_code: int | None = None
        self.on_receive = None

    async def accept(self, subprotocol: str | None = None) -> None:
        self.accepted = True
        self.accepted_subprotocol = subprotocol

    async def close(self, code: int = 1000) -> None:
        self.close_code = code

    async def receive_text(self) -> str:
        if self.on_receive:
            self.on_receive()
        raise WebSocketDisconnect()

    async def send_text(self, data: str) -> None:
        pass


async def _handshake(ws: _FakeWebSocket, monkeypatch) -> None:
    """Run the WS endpoint once, with its session factory routed to the test DB."""
    import app.core.database as database_module
    from app.api.v1.notifications import notification_websocket

    monkeypatch.setattr(database_module, "get_session_maker", lambda: TestSessionLocal)
    await notification_websocket(ws)


class TestWebSocketHandshakeAuth:
    """The JWT rides in a WebSocket subprotocol (``["bearer", <token>]``) instead
    of the query string, which would land in proxy/uvicorn access logs."""

    async def test_subprotocol_token_authenticates(self, client: AsyncClient, auth_headers: dict, monkeypatch):
        from app.api.v1.notifications import ws_manager

        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        token = auth_headers["Authorization"].removeprefix("Bearer ")
        ws = _FakeWebSocket(protocols=f"bearer, {token}")
        registered: list[bool] = []
        ws.on_receive = lambda: registered.append(ws in ws_manager._connections.get(me["id"], []))
        try:
            await _handshake(ws, monkeypatch)

            assert ws.accepted is True
            # RFC 6455: the echoed subprotocol must be one the client requested —
            # the generic marker, never the token itself.
            assert ws.accepted_subprotocol == "bearer"
            assert registered == [True]
            assert me["id"] not in ws_manager._connections
        finally:
            ws_manager._connections.pop(me["id"], None)

    async def test_missing_token_closes_with_policy_violation(self, monkeypatch):
        ws = _FakeWebSocket()

        await _handshake(ws, monkeypatch)

        assert ws.accepted is False
        assert ws.close_code == status.WS_1008_POLICY_VIOLATION

    async def test_invalid_token_closes_with_policy_violation(self, monkeypatch):
        ws = _FakeWebSocket(protocols="bearer, not-a-jwt")

        await _handshake(ws, monkeypatch)

        assert ws.accepted is False
        assert ws.close_code == status.WS_1008_POLICY_VIOLATION

    async def test_query_string_token_is_rejected(self, client: AsyncClient, auth_headers: dict, monkeypatch):
        token = auth_headers["Authorization"].removeprefix("Bearer ")
        ws = _FakeWebSocket(query_token=token)

        await _handshake(ws, monkeypatch)

        assert ws.accepted is False
        assert ws.close_code == status.WS_1008_POLICY_VIOLATION

    async def test_auth_cookie_is_accepted_as_fallback(self, client: AsyncClient, auth_headers: dict, monkeypatch):
        from app.api.v1.notifications import ws_manager

        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        token = auth_headers["Authorization"].removeprefix("Bearer ")
        ws = _FakeWebSocket(cookie=token)
        try:
            await _handshake(ws, monkeypatch)

            assert ws.accepted is True
            assert ws.accepted_subprotocol is None
        finally:
            ws_manager._connections.pop(me["id"], None)
