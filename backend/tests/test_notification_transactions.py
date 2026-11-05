"""No realtime notification may escape an uncommitted or failed transaction."""

import pytest

from app.core.database import get_async_session_maker
from app.models.notification import Notification
from app.models.user import User
from app.services import notification_service


async def seed_user(db):
    user = User(phone="13800009812", name="Notifications")
    db.add(user)
    await db.commit()
    return user.id


async def test_rollback_never_pushes_uncommitted_notification(db_session, monkeypatch):
    uid = await seed_user(db_session)
    pushed = []

    async def capture(notification, user_id):
        pushed.append(notification.id)

    monkeypatch.setattr(notification_service, "_push_notification", capture)
    row = await notification_service.create_notification(uid, "system", "title", "message", db_session)
    nid = row.id
    await db_session.rollback()
    assert pushed == []
    assert await db_session.get(Notification, nid) is None


async def test_commit_is_visible_before_push_and_duplicate_ids_push_once(db_session, monkeypatch):
    uid = await seed_user(db_session)
    pushed = []

    async def capture(notification, user_id):
        async with get_async_session_maker()() as reader:
            row = await reader.get(Notification, notification.id)
            assert row is not None and row.title == "latest"
        pushed.append(notification.id)

    monkeypatch.setattr(notification_service, "_push_notification", capture)
    first = await notification_service.create_notification(uid, "system", "first", "message", db_session, "/audit")
    latest = await notification_service.create_notification(uid, "system", "latest", "message", db_session, "/audit")
    assert first.id == latest.id
    assert pushed == []
    await notification_service.commit_and_push(db_session, [first, latest])
    assert pushed == [latest.id]


async def test_failed_commit_sends_nothing(db_session, monkeypatch):
    uid = await seed_user(db_session)
    pushed = []

    async def capture(notification, user_id):
        pushed.append(notification.id)

    async def broken_commit():
        raise RuntimeError("commit failed")

    monkeypatch.setattr(notification_service, "_push_notification", capture)
    row = await notification_service.create_notification(uid, "system", "title", "message", db_session)
    nid = row.id
    monkeypatch.setattr(db_session, "commit", broken_commit)
    with pytest.raises(RuntimeError, match="commit failed"):
        await notification_service.commit_and_push(db_session, [row])
    await db_session.rollback()
    assert pushed == []
    assert await db_session.get(Notification, nid) is None


async def test_push_failure_does_not_undo_committed_notification(db_session, monkeypatch):
    uid = await seed_user(db_session)

    async def broken_transport(*args):
        raise ConnectionError("offline")

    monkeypatch.setattr("app.services.notification_transport.push_to_user", broken_transport)
    row = await notification_service.create_notification(uid, "system", "title", "message", db_session)
    nid = row.id
    await notification_service.commit_and_push(db_session, [row])
    async with get_async_session_maker()() as reader:
        assert await reader.get(Notification, nid) is not None
