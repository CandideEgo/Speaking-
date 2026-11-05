"""Unit tests for the thin gateway adapter.

Run from this directory with:
  python -m pytest test_adapter.py -q
The integration behaviour (drain on disconnect, LiteLLM settlement) is covered
by backend/scripts/check_v2_gateway.py against the synthetic Compose stack.
"""

import json

import httpx
import pytest

import app as adapter


@pytest.fixture(autouse=True)
def restore_env(monkeypatch):
    monkeypatch.setattr(adapter, "MODEL_MAX_OUTPUT_TOKENS", 128)
    yield


def run(application, method, url, **kwargs):
    async def go():
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.request(method, url, **kwargs)

    return __import__("asyncio").run(go())


def test_rejects_output_above_cap(monkeypatch):
    async def boom(*_args, **_kwargs):
        raise AssertionError("upstream must not be called")

    monkeypatch.setattr(adapter, "_call", boom)
    response = run(adapter.app, "POST", "/chat/completions", json={"max_tokens": 129})
    assert response.status_code == 422
    assert response.json()["error"]["type"] == "output_cap_exceeded"


def test_requires_max_tokens(monkeypatch):
    async def boom(*_args, **_kwargs):
        raise AssertionError("upstream must not be called")

    monkeypatch.setattr(adapter, "_call", boom)
    response = run(adapter.app, "POST", "/v1/chat/completions", json={"messages": []})
    assert response.status_code == 422


def test_proxies_admin_query_string(monkeypatch):
    seen = {}

    async def fake_call(url, method, headers, body):
        seen["url"] = url
        return 200, {"content-type": "application/json"}, b'{"ok":true}'

    monkeypatch.setattr(adapter, "_call", fake_call)
    response = run(adapter.app, "GET", "/team/info?team_id=abc-123")
    assert response.status_code == 200
    assert seen["url"].endswith("/team/info?team_id=abc-123")


def test_shim_injects_conservative_usage(monkeypatch):
    async def fake_upstream(request, body):
        return (
            200,
            {"content-type": "application/json"},
            json.dumps({"id": "x", "choices": [{"message": {"role": "assistant", "content": "hi"}}]}).encode(),
        )

    monkeypatch.setattr(adapter, "_forward_upstream", fake_upstream)
    request_body = {"model": "m", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 64}
    response = run(
        adapter.shim_app,
        "POST",
        "/v1/chat/completions",
        json=request_body,
        headers={"Authorization": "Bearer provider-key"},
    )
    assert response.status_code == 200
    usage = response.json()["usage"]
    assert usage["completion_tokens"] == 64
    assert usage["prompt_tokens"] > 0


def test_shim_keeps_provider_usage(monkeypatch):
    provider_usage = {"prompt_tokens": 7, "completion_tokens": 9, "total_tokens": 16}

    async def fake_upstream(request, body):
        return (
            200,
            {"content-type": "application/json"},
            json.dumps({"id": "x", "choices": [], "usage": provider_usage}).encode(),
        )

    monkeypatch.setattr(adapter, "_forward_upstream", fake_upstream)
    response = run(
        adapter.shim_app,
        "POST",
        "/v1/chat/completions",
        json={"model": "m", "messages": [], "max_tokens": 64},
    )
    assert response.json()["usage"] == provider_usage


def test_shim_defaults_to_model_cap_when_max_tokens_missing(monkeypatch):
    async def fake_upstream(request, body):
        return 200, {"content-type": "application/json"}, json.dumps({"id": "x", "choices": []}).encode()

    monkeypatch.setattr(adapter, "_forward_upstream", fake_upstream)
    response = run(adapter.shim_app, "POST", "/v1/chat/completions", json={"model": "m", "messages": []})
    assert response.json()["usage"]["completion_tokens"] == 128
