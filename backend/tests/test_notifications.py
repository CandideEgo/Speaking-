"""Tests for the notifications API (/api/v1/notifications)."""

from httpx import AsyncClient

from app.models.notification import Notification
from tests.conftest import TestSessionLocal


class TestListNotifications:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/v1/notifications")).status_code == 401

    async def test_empty_for_new_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/notifications", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

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
        items = resp.json()
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
                email="other@example.com",
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
        items = (await client.get("/api/v1/notifications", headers=auth_headers)).json()
        assert all(n["is_read"] for n in items)


class TestPreferences:
    async def test_get_default_preferences(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/notifications/preferences", headers=auth_headers)
        assert resp.status_code == 200
        prefs = resp.json()
        # Defaults from the route
        assert prefs["email_notifications"] is True
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
        assert prefs["email_notifications"] is True

    async def test_preferences_persist(self, client: AsyncClient, auth_headers: dict):
        await client.put(
            "/api/v1/notifications/preferences",
            headers=auth_headers,
            json={"new_follower": False},
        )
        resp = await client.get("/api/v1/notifications/preferences", headers=auth_headers)
        assert resp.json()["new_follower"] is False
