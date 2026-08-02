"""Tests for the feedback/announcement system (Stage 4).

User side: POST /feedback submits, GET /feedback/mine lists own feedback.
Admin side: GET /admin/feedback lists all, PATCH /admin/feedback/{id} updates
status/reply, POST /admin/announcements broadcasts to every user.
"""

import pytest
from httpx import AsyncClient


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
    resp = await client.get("/api/v1/admin/feedback", headers=admin_headers)
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
    resp = await client.get("/api/v1/admin/feedback", headers=auth_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_broadcast_announcement_notifies_all_users(client: AsyncClient, auth_headers: dict, admin_headers: dict):
    # Broadcast an announcement.
    resp = await client.post(
        "/api/v1/admin/announcements",
        headers=admin_headers,
        json={"title": "系统维护通知", "message": "今晚 22:00-23:00 维护，暂停服务"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["title"] == "系统维护通知"
    # At least the authed user + admin received it (>= 2 users in the test DB).
    assert body["notified_count"] >= 2

    # The regular user sees the announcement in their notifications.
    resp = await client.get("/api/v1/notifications", headers=auth_headers)
    assert resp.status_code == 200
    notifs = resp.json()["items"]
    announcement = [n for n in notifs if n["type"] == "announcement"]
    assert len(announcement) >= 1
    assert announcement[0]["title"] == "系统维护通知"


@pytest.mark.asyncio
async def test_broadcast_announcement_requires_admin(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/admin/announcements",
        headers=auth_headers,
        json={"title": "x", "message": "y"},
    )
    assert resp.status_code == 403
