"""Tests for the feedback/announcement system (Stage 4).

User side: POST /feedback submits, GET /feedback/mine lists own feedback.
Admin side: GET /admin/feedback lists all, PATCH /admin/feedback/{id} updates
status/reply, POST /admin/announcements queues a broadcast.

ADM-07 / ADM-10 regression coverage lives at the bottom: the list endpoint is a
typed ``PaginatedResponse`` with ``total`` + an id tiebreaker, and the broadcast
request only counts recipients + enqueues a Celery task (the per-user INSERTs
happen in the worker, in bounded chunks).
"""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import event, func, select

from app.models.feedback import Feedback
from app.models.notification import Notification
from app.models.user import User
from app.tasks.notification_tasks import (
    BROADCAST_ANNOUNCEMENT_TASK_NAME,
    _broadcast_announcement_async,
)
from tests.conftest import TestSessionLocal, test_engine

ANNOUNCEMENTS_URL = "/api/v1/admin/announcements"
FEEDBACK_LIST_URL = "/api/v1/admin/feedback"


@pytest.mark.asyncio
async def test_submit_feedback_and_list_mine(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"category": "bug", "content": "播放页字幕拖不动，建议修复", "contact": "qq@example.com"},
    )
    assert resp.status_code == 201, resp.text
    fb = resp.json()
    assert fb["category"] == "bug"
    assert fb["status"] == "open"
    assert fb["admin_reply"] is None
    assert fb["contact"] == "qq@example.com"

    # List my feedback - the one we just submitted is there.
    resp = await client.get("/api/v1/feedback/mine", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["id"] == fb["id"]


@pytest.mark.asyncio
async def test_submit_feedback_rejects_short_content(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"content": "hi"},
    )
    assert resp.status_code == 422  # min_length=5


@pytest.mark.asyncio
async def test_submit_feedback_requires_auth(client: AsyncClient):
    resp = await client.post(
        "/api/v1/feedback",
        json={"content": "anonymous feedback should be rejected"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_list_feedback(client: AsyncClient, auth_headers: dict, admin_headers: dict):
    # A user submits feedback.
    await client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"category": "suggestion", "content": "希望能加暗色模式"},
    )
    # Admin lists all feedback.
    resp = await client.get(FEEDBACK_LIST_URL, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["items"]) >= 1
    item = body["items"][0]
    assert item["category"] == "suggestion"
    # Admin sees the user_name (redacted phone fallback).
    assert item["user_name"] is not None


@pytest.mark.asyncio
async def test_admin_update_feedback_status_and_reply(client: AsyncClient, auth_headers: dict, admin_headers: dict):
    submit = await client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"content": "某个单词点击无反应"},
    )
    fb_id = submit.json()["id"]

    # Admin replies + marks in_progress.
    resp = await client.patch(
        f"/api/v1/admin/feedback/{fb_id}",
        headers=admin_headers,
        json={"status": "in_progress", "admin_reply": "已复现，排查中"},
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["status"] == "in_progress"
    assert updated["admin_reply"] == "已复现，排查中"
    assert updated["handled_by"] is not None

    # User sees the reply on /feedback/mine.
    mine = await client.get("/api/v1/feedback/mine", headers=auth_headers)
    assert mine.json()[0]["admin_reply"] == "已复现，排查中"


@pytest.mark.asyncio
async def test_admin_update_feedback_not_found(client: AsyncClient, admin_headers: dict):
    resp = await client.patch(
        "/api/v1/admin/feedback/nonexistent-id",
        headers=admin_headers,
        json={"status": "resolved"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_feedback_admin_endpoints_require_admin(client: AsyncClient, auth_headers: dict):
    # A non-admin user cannot list admin feedback.
    resp = await client.get(FEEDBACK_LIST_URL, headers=auth_headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# ADM-10: typed paginated feedback list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_list_feedback_returns_typed_envelope_with_total(
    client: AsyncClient, auth_headers: dict, admin_headers: dict
):
    for index in range(3):
        resp = await client.post("/api/v1/feedback", headers=auth_headers, json={"content": f"反馈内容 {index}"})
        assert resp.status_code == 201, resp.text

    first = await client.get(f"{FEEDBACK_LIST_URL}?page=1&page_size=2", headers=admin_headers)
    assert first.status_code == 200, first.text
    body = first.json()
    assert sorted(body) == ["has_more", "items", "page", "page_size", "total"]
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["has_more"] is True

    second = (await client.get(f"{FEEDBACK_LIST_URL}?page=2&page_size=2", headers=admin_headers)).json()
    assert second["total"] == 3
    assert len(second["items"]) == 1
    assert second["has_more"] is False


def test_admin_feedback_list_is_typed_in_openapi():
    """The endpoint used to declare ``response_model=dict`` (no shape at all)."""
    from app.main import create_app

    openapi = create_app().openapi()
    operation = openapi["paths"][FEEDBACK_LIST_URL]["get"]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema["$ref"].endswith("PaginatedResponse_AdminFeedbackRow_")
    # The announcement response stays typed as well (ADM-07 added ``queued``).
    announcement = openapi["paths"][ANNOUNCEMENTS_URL]["post"]
    assert announcement["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "AnnouncementResponse"
    )
    assert "queued" in openapi["components"]["schemas"]["AnnouncementResponse"]["properties"]


@pytest.mark.asyncio
async def test_admin_feedback_order_has_id_tiebreaker(client: AsyncClient, auth_headers: dict, admin_headers: dict):
    """Equal ``created_at`` values must not make OFFSET paging repeat/skip rows."""
    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    stamp = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    async with TestSessionLocal() as db:
        db.add_all(
            [
                Feedback(
                    user_id=me["id"],
                    category="suggestion",
                    content=f"同一时间戳 {index}",
                    status="open",
                    created_at=stamp,
                )
                for index in range(2)
            ]
        )
        await db.commit()

    seen = []
    for page in (1, 2):
        body = (await client.get(f"{FEEDBACK_LIST_URL}?page={page}&page_size=1", headers=admin_headers)).json()
        assert body["total"] == 2
        seen.append(body["items"][0]["id"])
    assert len(set(seen)) == 2


# ---------------------------------------------------------------------------
# ADM-07: announcement fan-out moved to Celery
# ---------------------------------------------------------------------------


async def _create_extra_users(count: int) -> int:
    """Add `count` real users to the test DB and return the total user count."""
    async with TestSessionLocal() as db:
        db.add_all(
            [User(phone=f"1360000{index:04d}", hashed_password="x", name=f"Extra {index}") for index in range(count)]
        )
        await db.commit()
        return int((await db.scalar(select(func.count()).select_from(User))) or 0)


@pytest.mark.asyncio
async def test_broadcast_announcement_only_enqueues_task(
    client: AsyncClient, auth_headers: dict, admin_headers: dict, _mock_celery
):
    before = (await client.get("/api/v1/notifications", headers=auth_headers)).json()["items"]
    assert [n for n in before if n["type"] == "announcement"] == []

    resp = await client.post(
        ANNOUNCEMENTS_URL,
        headers=admin_headers,
        json={"title": "系统维护通知", "message": "今晚 22:00-23:00 维护，暂停服务"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["queued"] is True
    assert body["title"] == "系统维护通知"
    assert body["message"] == "今晚 22:00-23:00 维护，暂停服务"
    # At least the authed user + admin are recipients.
    assert body["notified_count"] >= 2

    # The request path must not fan out: no per-user notification rows yet.
    after = (await client.get("/api/v1/notifications", headers=auth_headers)).json()["items"]
    assert [n for n in after if n["type"] == "announcement"] == []

    dispatches = [call for call in _mock_celery if call[0] == BROADCAST_ANNOUNCEMENT_TASK_NAME]
    assert len(dispatches) == 1
    _name, args, kwargs = dispatches[0]
    assert args == ()
    assert kwargs == {
        "title": "系统维护通知",
        "message": "今晚 22:00-23:00 维护，暂停服务",
        "related_url": None,
    }


@pytest.mark.asyncio
async def test_announcement_task_bulk_inserts_one_statement_per_chunk(
    client: AsyncClient, auth_headers: dict, admin_headers: dict
):
    total_users = await _create_extra_users(5)  # auth user + admin + 5 => 7
    insert_statements: list[str] = []

    def _capture(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("INSERT INTO NOTIFICATIONS"):
            insert_statements.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", _capture)
    try:
        processed = await _broadcast_announcement_async("批量公告", "正文", chunk_size=3)
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", _capture)

    assert processed == total_users
    async with TestSessionLocal() as db:
        rows = (await db.execute(select(Notification).where(Notification.type == "announcement"))).scalars().all()
    assert len(rows) == total_users
    assert {row.title for row in rows} == {"批量公告"}
    assert {row.message for row in rows} == {"正文"}
    assert all(row.is_read is False for row in rows)
    # ceil(users / chunk_size) multi-row INSERTs — not one INSERT per user.
    assert len(insert_statements) == -(-total_users // 3)


@pytest.mark.asyncio
async def test_announcement_task_preserves_unread_dedup_semantics(
    client: AsyncClient, auth_headers: dict, admin_headers: dict
):
    total_users = await _create_extra_users(3)  # auth user + admin + 3 => 5

    first = await _broadcast_announcement_async(
        "第一版", "旧正文", related_url="/announcements/maintenance", chunk_size=2
    )
    assert first == total_users
    second = await _broadcast_announcement_async(
        "第二版", "新正文", related_url="/announcements/maintenance", chunk_size=2
    )
    assert second == total_users

    async with TestSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(Notification).where(
                        Notification.type == "announcement",
                        Notification.related_url == "/announcements/maintenance",
                    )
                )
            )
            .scalars()
            .all()
        )
    # Same related_url => updated in place, no duplicated rows.
    assert len(rows) == total_users
    assert {row.title for row in rows} == {"第二版"}
    assert {row.message for row in rows} == {"新正文"}

    # Read rows are not dedup targets: the next broadcast adds a fresh row for
    # that user only (same rule create_notification had).
    async with TestSessionLocal() as db:
        read_row = (await db.execute(select(Notification).limit(1))).scalar_one()
        read_row.is_read = True
        await db.commit()
    third = await _broadcast_announcement_async("第三版", "v3", related_url="/announcements/maintenance", chunk_size=2)
    assert third == total_users
    async with TestSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(Notification).where(
                        Notification.type == "announcement",
                        Notification.related_url == "/announcements/maintenance",
                    )
                )
            )
            .scalars()
            .all()
        )
    assert len(rows) == total_users + 1  # the read row was left alone, one new row
    assert len([row for row in rows if row.is_read is False and row.title == "第三版"]) == total_users
    assert len([row for row in rows if row.title == "第二版"]) == 1

    # Without related_url every broadcast is a fresh announcement (old behaviour).
    await _broadcast_announcement_async("无链接 A", "a", chunk_size=2)
    await _broadcast_announcement_async("无链接 B", "b", chunk_size=2)
    async with TestSessionLocal() as db:
        no_url_count = await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.type == "announcement",
                Notification.related_url.is_(None),
            )
        )
    assert no_url_count == 2 * total_users


@pytest.mark.asyncio
async def test_broadcast_announcement_requires_admin(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        ANNOUNCEMENTS_URL,
        headers=auth_headers,
        json={"title": "x", "message": "y"},
    )
    assert resp.status_code == 403
