"""Tests for alert_service (E4 external alert channel)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.alert_service import _dingtalk_sign, send_alert


@pytest.mark.asyncio
async def test_send_alert_falls_back_to_in_app_when_no_webhook(monkeypatch):
    """When alert_webhook_url is empty, send_alert posts an in-app admin
    notification instead of hitting a webhook."""
    monkeypatch.setattr(
        "app.services.alert_service.get_settings",
        lambda: type(
            "S",
            (),
            {
                "alert_webhook_url": "",
                "alert_webhook_secret": "",
            },
        )(),
    )

    # Patch the fallback so we can assert it ran without needing a real DB admin.
    with patch(
        "app.services.alert_service._notify_admins_fallback",
        new=AsyncMock(),
    ) as mock_fallback:
        result = await send_alert("Test Alert", "something broke", severity="critical")
    assert result is True
    mock_fallback.assert_awaited_once_with("Test Alert", "something broke")


@pytest.mark.asyncio
async def test_send_alert_posts_to_webhook(monkeypatch):
    """When alert_webhook_url is set, send_alert POSTs the alert JSON."""
    monkeypatch.setattr(
        "app.services.alert_service.get_settings",
        lambda: type(
            "S",
            (),
            {
                "alert_webhook_url": "https://hooks.example.com/alert",
                "alert_webhook_secret": "",
            },
        )(),
    )

    captured: dict = {}

    class FakeResp:
        status_code = 200
        text = "ok"

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None):
            captured["url"] = url
            captured["json"] = json
            return FakeResp()

    with patch("app.services.alert_service.httpx.AsyncClient", FakeClient):
        result = await send_alert("DB Down", "postgres unreachable")

    assert result is True
    assert captured["url"] == "https://hooks.example.com/alert"
    # DingTalk-style text payload.
    assert captured["json"]["msgtype"] == "text"
    assert "DB Down" in captured["json"]["text"]["content"]
    assert "postgres unreachable" in captured["json"]["text"]["content"]


@pytest.mark.asyncio
async def test_send_alert_returns_false_on_webhook_failure(monkeypatch):
    """A non-2xx webhook response returns False (no exception raised)."""
    monkeypatch.setattr(
        "app.services.alert_service.get_settings",
        lambda: type(
            "S",
            (),
            {
                "alert_webhook_url": "https://hooks.example.com/alert",
                "alert_webhook_secret": "",
            },
        )(),
    )

    class FakeResp:
        status_code = 500
        text = "server error"

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None):
            return FakeResp()

    with patch("app.services.alert_service.httpx.AsyncClient", FakeClient):
        result = await send_alert("x", "y")
    assert result is False


def test_dingtalk_sign_deterministic():
    """The DingTalk sign is deterministic for the same (secret, timestamp)."""
    s1 = _dingtalk_sign("mysecret", 1700000000000)
    s2 = _dingtalk_sign("mysecret", 1700000000000)
    assert s1 == s2
    # Different timestamp -> different signature.
    s3 = _dingtalk_sign("mysecret", 1700000000001)
    assert s1 != s3
