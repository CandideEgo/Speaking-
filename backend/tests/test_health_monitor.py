"""Tests for the A09 health monitor (worker/beat/queue/disk/DB checks)."""

from __future__ import annotations

import time
from types import SimpleNamespace

import pytest

from app.core.heartbeat import BEAT_HEARTBEAT_KEY, GPU_HEARTBEAT_KEY, WORKER_HEARTBEAT_KEY
from app.services import health_monitor as hm


class FakeRedis:
    """Only the commands the monitor uses; mirrors redis-py's return shapes."""

    def __init__(self, values: dict | None = None, lengths: dict | None = None, lists: dict | None = None) -> None:
        self.values = dict(values or {})
        self.lengths = dict(lengths or {})
        self.lists = dict(lists or {})
        self.now = None  # when set, a broken redis for the redis-failure test

    async def get(self, key):
        if self.now == "raise":
            raise ConnectionError("redis down")
        return self.values.get(key)

    async def llen(self, key):
        return self.lengths.get(key, 0)

    async def lrange(self, key, start, end):
        return self.lists.get(key, [])[start : end + 1]

    async def exists(self, key):
        return 1 if key in self.values else 0

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.values:
            return None
        self.values[key] = value
        return True


def _settings(**overrides) -> SimpleNamespace:
    base = dict(
        health_worker_stale_seconds=300,
        health_beat_stale_seconds=300,
        health_queue_backlog_threshold=200,
        transcription_gpu_queue_name="transcription_gpu",
        health_disk_percent_threshold=85,
        local_media_path=".",
        health_pipeline_failure_window_minutes=60,
        health_pipeline_failure_threshold=5,
        health_alert_throttle_seconds=1800,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _fresh() -> dict:
    now = f"{time.time():.3f}"
    return {WORKER_HEARTBEAT_KEY: now, BEAT_HEARTBEAT_KEY: now, GPU_HEARTBEAT_KEY: "1"}


async def test_healthy_system_reports_no_problems():
    problems = await hm.collect_problems(redis=FakeRedis(_fresh()), settings=_settings())
    assert problems == []


async def test_stale_worker_is_reported():
    values = _fresh()
    values[WORKER_HEARTBEAT_KEY] = f"{time.time() - 900:.3f}"
    problems = await hm.collect_problems(redis=FakeRedis(values), settings=_settings())
    kinds = {p.kind for p in problems}
    assert "cloud_worker_stale" in kinds


async def test_missing_heartbeats_are_stale():
    problems = await hm.collect_problems(redis=FakeRedis({}), settings=_settings())
    kinds = {p.kind for p in problems}
    assert {"cloud_worker_stale", "beat_stale"} <= kinds


async def test_queue_backlog_is_reported():
    redis = FakeRedis(_fresh(), lengths={"celery": 500})
    problems = await hm.collect_problems(redis=redis, settings=_settings())
    backlog = [p for p in problems if p.kind == "cloud_queue_backlog"]
    assert backlog and "depth=500" in backlog[0].detail


async def test_gpu_backlog_without_heartbeat_is_reported():
    redis = FakeRedis(_fresh(), lengths={"transcription_gpu": 3})
    redis.values.pop(GPU_HEARTBEAT_KEY)
    problems = await hm.collect_problems(redis=redis, settings=_settings())
    assert any(p.kind == "gpu_worker_offline_with_backlog" for p in problems)


async def test_pipeline_failure_spike_is_reported_with_video_ids():
    import json
    import time

    from app.services.pipeline_alerting import FAILURE_LIST_KEY

    entries = [
        json.dumps({"ts": time.time(), "video_id": f"vid-{i}", "step": "translating", "reason": "x"}) for i in range(6)
    ]
    redis = FakeRedis(_fresh(), lists={FAILURE_LIST_KEY: entries})

    problems = await hm.collect_problems(redis=redis, settings=_settings())

    spike = [p for p in problems if p.kind == "pipeline_failure_rate"]
    assert spike
    assert "vid-0" in spike[0].detail
    assert "translating" in spike[0].detail


async def test_old_pipeline_failures_fall_outside_the_window():
    import json
    import time

    from app.services.pipeline_alerting import FAILURE_LIST_KEY

    entries = [json.dumps({"ts": time.time() - 7200, "video_id": f"old-{i}", "step": "translating"}) for i in range(10)]
    redis = FakeRedis(_fresh(), lists={FAILURE_LIST_KEY: entries})

    problems = await hm.collect_problems(redis=redis, settings=_settings())

    assert not any(p.kind == "pipeline_failure_rate" for p in problems)


async def test_redis_failure_is_a_problem_not_a_crash(monkeypatch):
    redis = FakeRedis(_fresh())
    redis.now = "raise"
    problems = await hm.collect_problems(redis=redis, settings=_settings())
    assert any(p.kind == "health_check_redis_failed" for p in problems)


async def test_database_failure_still_reports_its_own_alert(monkeypatch):
    def _broken_maker():
        def _raise():
            raise RuntimeError("db down")

        return _raise

    monkeypatch.setattr("app.core.database.get_async_session_maker", _broken_maker)
    problems = await hm.collect_problems(redis=FakeRedis(_fresh()), settings=_settings())
    db = [p for p in problems if p.kind == "database_unreachable"]
    assert db and "db down" in db[0].detail


async def test_check_once_alerts_and_then_throttles(monkeypatch):
    sent: list[tuple[str, str, str]] = []

    async def _fake_send(title, message, *, severity="warning"):
        sent.append((title, message, severity))
        return True

    monkeypatch.setattr("app.services.alert_service.send_alert", _fake_send)
    monkeypatch.setattr(hm, "get_settings", lambda: _settings())

    redis = FakeRedis({}, lengths={"celery": 500})
    first = await hm.check_once(redis=redis)
    second = await hm.check_once(redis=redis)

    assert {p.kind for p in first} == {"cloud_worker_stale", "beat_stale", "cloud_queue_backlog"}
    # Same problems again, but each kind already alerted inside the window.
    assert len(sent) == 3
    assert {p.kind for p in second} == {p.kind for p in first}
    assert len(sent) == 3


async def test_alert_survives_throttle_storage_failure(monkeypatch):
    sent: list[str] = []

    async def _fake_send(title, message, *, severity="warning"):
        sent.append(title)
        return True

    monkeypatch.setattr("app.services.alert_service.send_alert", _fake_send)
    monkeypatch.setattr(hm, "get_settings", lambda: _settings())

    class BrokenSetRedis(FakeRedis):
        async def set(self, key, value, nx=False, ex=None):
            raise ConnectionError("redis down")

    problems = await hm.check_once(redis=BrokenSetRedis({}))
    assert problems
    assert len(sent) == len(problems)


@pytest.mark.parametrize("percent", [85.0, 99.0])
def test_disk_threshold_marks_severity(percent, monkeypatch):
    class _Usage:
        total = 100
        used = percent
        free = 100 - percent

    monkeypatch.setattr(hm.shutil, "disk_usage", lambda _path: _Usage())
    problems = hm._disk_problems(_settings())
    assert len(problems) == 1
    assert problems[0].severity == ("critical" if percent >= 95 else "warning")
