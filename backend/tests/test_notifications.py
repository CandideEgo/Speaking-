"""Tests for the notifications API (/api/v1/notifications)."""

from fastapi import WebSocketDisconnect
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
                related_url="/community?post=123",
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
                related_url="/community?post=123",
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
                related_url="/community?post=123",
                actor_id="actor-a",
            )
            n2 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="用户B 赞了你的帖子",
                db=db,
                related_url="/community?post=123",
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
                related_url="/community?post=456",
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
                related_url="/community?post=456",
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
                related_url="/community?post=789",
            )
            await db.commit()

            # No actor_id — same key dedupes even though "different actor"
            n2 = await create_notification(
                user_id=me["id"],
                type="post_liked",
                title="收到点赞",
                message="另一个人 赞了你的帖子",
                db=db,
                related_url="/community?post=789",
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
                related_url="/community?post=100",
                actor_id="actor-xyz",
            )
            await db.commit()

            import json

            data = json.loads(n.data)
            assert data["actor_id"] == "actor-xyz"
