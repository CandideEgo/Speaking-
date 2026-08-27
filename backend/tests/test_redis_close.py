"""close_redis() 版本兼容测试。

生产钉死 redis==5.0.0，其 asyncio 客户端没有 aclose()（5.0.1 才引入）；
此前直接调 aclose() 导致每次 worker 关停都抛 AttributeError
（gunicorn 报 "Application shutdown failed"）。
"""

import pytest

from app.core import redis as redis_core


@pytest.fixture
def restore_redis_singleton():
    original = redis_core._redis
    yield
    redis_core._redis = original


async def test_close_redis_uses_close_when_aclose_missing(restore_redis_singleton):
    """redis-py 5.0.0：无 aclose，回退 close()。"""
    calls = {}

    class FakeRedis:
        async def close(self):
            calls["close"] = True

    redis_core._redis = FakeRedis()
    await redis_core.close_redis()
    assert calls.get("close") is True
    assert redis_core._redis is None


async def test_close_redis_prefers_aclose_when_available(restore_redis_singleton):
    """redis-py >= 5.0.1：优先 aclose()。"""
    calls = {}

    class FakeRedis:
        async def aclose(self):
            calls["aclose"] = True

        async def close(self):
            calls["close"] = True

    redis_core._redis = FakeRedis()
    await redis_core.close_redis()
    assert calls.get("aclose") is True
    assert "close" not in calls
    assert redis_core._redis is None


async def test_close_redis_noop_when_unset(restore_redis_singleton):
    redis_core._redis = None
    await redis_core.close_redis()
    assert redis_core._redis is None
