"""Tests for GET /health/heartbeats (A09 external uptime signal)."""

from __future__ import annotations

import time

from app.core.heartbeat import BEAT_HEARTBEAT_KEY, GPU_HEARTBEAT_KEY, WORKER_HEARTBEAT_KEY


def _fresh(store: dict) -> None:
    now = f"{time.time():.3f}"
    store[WORKER_HEARTBEAT_KEY] = now
    store[BEAT_HEARTBEAT_KEY] = now


async def test_healthy_heartbeats_return_200(client, fake_redis):
    _fresh(fake_redis._store)
    fake_redis._store[GPU_HEARTBEAT_KEY] = "1"

    resp = await client.get("/health/heartbeats")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["components"]["cloud_worker"]["status"] == "ok"
    assert body["components"]["beat"]["status"] == "ok"
    assert body["components"]["gpu_worker"]["status"] == "online"


async def test_missing_worker_heartbeat_returns_503(client, fake_redis):
    fake_redis._store[BEAT_HEARTBEAT_KEY] = f"{time.time():.3f}"

    resp = await client.get("/health/heartbeats")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["components"]["cloud_worker"]["status"] == "stale"
    assert body["components"]["beat"]["status"] == "ok"


async def test_gpu_offline_does_not_fail_the_check(client, fake_redis):
    """The GPU worker may be offline on purpose (embed playback is the fallback)."""
    _fresh(fake_redis._store)

    resp = await client.get("/health/heartbeats")

    assert resp.status_code == 200
    assert resp.json()["components"]["gpu_worker"]["status"] == "offline"


async def test_stale_beat_returns_503(client, fake_redis):
    fake_redis._store[WORKER_HEARTBEAT_KEY] = f"{time.time():.3f}"
    fake_redis._store[BEAT_HEARTBEAT_KEY] = f"{time.time() - 3600:.3f}"

    resp = await client.get("/health/heartbeats")

    assert resp.status_code == 503
    assert resp.json()["components"]["beat"]["status"] == "stale"
