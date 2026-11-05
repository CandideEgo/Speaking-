"""Teaching gateway request shape: team membership before the per-run key."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest

from app.core.errors import AppError
from app.services import teaching_gateway


def _settings(**overrides):
    values = {
        "llm_gateway_governance_verified": True,
        "llm_gateway_base_url": "http://gateway.test",
        "llm_gateway_admin_key": "master-test",
        "llm_gateway_v2_team_id": "team-test",
        "llm_gateway_model": "teaching",
        "v2_run_budget_usd": 0.02,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _install_transport(monkeypatch, handler):
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(teaching_gateway.httpx, "AsyncClient", factory)


async def _choose():
    return await teaching_gateway.choose_intent(
        "user-1",
        "run-1",
        "call-1",
        "hint please",
        {"question": "q"},
        datetime.now(UTC) + timedelta(seconds=30),
    )


@pytest.mark.asyncio
async def test_provisions_team_membership_before_key(monkeypatch):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/user/new":
            return httpx.Response(200, json={"user_id": "user-1"})
        if request.url.path == "/key/generate":
            return httpx.Response(200, json={"key": "sk-run"})
        if request.url.path == "/chat/completions":
            return httpx.Response(200, json={"choices": [{"message": {"content": '{"intent":"show_analysis"}'}}]})
        return httpx.Response(404)

    monkeypatch.setattr(teaching_gateway, "get_settings", lambda: _settings())
    _install_transport(monkeypatch, handler)

    assert await _choose() == "show_analysis"
    assert seen == ["/user/new", "/key/generate", "/chat/completions"]


@pytest.mark.asyncio
async def test_existing_membership_conflict_is_accepted(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/user/new":
            return httpx.Response(409, json={"error": "already exists"})
        if request.url.path == "/key/generate":
            return httpx.Response(200, json={"key": "sk-run"})
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"intent":"suggest_retry"}'}}]})

    monkeypatch.setattr(teaching_gateway, "get_settings", lambda: _settings())
    _install_transport(monkeypatch, handler)

    assert await _choose() == "suggest_retry"


@pytest.mark.asyncio
async def test_membership_provisioning_failure_fails_closed(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "unavailable"})

    monkeypatch.setattr(teaching_gateway, "get_settings", lambda: _settings())
    _install_transport(monkeypatch, handler)

    with pytest.raises(AppError) as exc:
        await _choose()
    assert exc.value.status_code == 503
