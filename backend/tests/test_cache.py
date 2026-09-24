"""Fail-open contract of ``app.core.cache``.

``app/core/cache.py`` documents every function as fail-open: a cache problem
must never break the API.  ``cache_set_json`` was the one place that broke the
contract — ``json.dumps`` ran *outside* the ``try``, so a non-JSON-native value
raised ``TypeError`` straight through the caller.

Both of its call paths matter, and they are covered separately below:

1. direct callers, which pass whatever their query produced;
2. the ``@cached`` decorator, whose ``await cache_set_json(...)`` sits at the
   tail of the wrapper — an exception there would turn a successful query into
   a 500 even though the function already returned a good value.
"""

import pytest
from structlog.testing import capture_logs

from app.core.cache import cache_get, cache_set_json, cached

_WARNING_EVENT = "cache_set_json_error"


class TestCacheSetJsonFailOpen:
    """A value that cannot be serialized must be a logged no-op, not a raise."""

    async def test_unserializable_value_is_a_no_op(self, fake_redis):
        with capture_logs() as logs:
            await cache_set_json("probe:set", {"when": object()})

        assert await cache_get("probe:set") is None
        assert any(e["event"] == _WARNING_EVENT for e in logs)

    async def test_unserializable_value_nested_deeply_is_a_no_op(self, fake_redis):
        """The failure is in the value, not the shape — nesting must not matter."""
        with capture_logs() as logs:
            await cache_set_json("probe:nested", {"items": [1, {"tags": {1, 2}}]})

        assert await cache_get("probe:nested") is None
        assert any(e["event"] == _WARNING_EVENT for e in logs)

    async def test_circular_reference_is_a_no_op(self, fake_redis):
        """``json.dumps`` raises ValueError (not TypeError) for a cycle — both count."""
        payload: dict = {"name": "cycle"}
        payload["self"] = payload

        with capture_logs() as logs:
            await cache_set_json("probe:cycle", payload)

        assert await cache_get("probe:cycle") is None
        assert any(e["event"] == _WARNING_EVENT for e in logs)

    async def test_serializable_value_is_still_cached(self, fake_redis):
        """The guard must not swallow the happy path."""
        await cache_set_json("probe:ok", {"level": "A2", "count": 3})

        assert await cache_get("probe:ok") == '{"level": "A2", "count": 3}'


class TestCachedDecoratorFailOpen:
    """A cached function must return its value even when caching it fails."""

    async def test_unserializable_result_is_still_returned(self, fake_redis):
        @cached(ttl=60, key="probe:cached:{name}")
        async def build(*, name: str) -> dict:
            return {"name": name, "when": object()}

        with capture_logs() as logs:
            result = await build(name="a")

        assert result["name"] == "a"
        assert await cache_get("probe:cached:a") is None
        assert any(e["event"] == _WARNING_EVENT for e in logs)

    async def test_serializable_result_is_returned_and_cached(self, fake_redis):
        calls = 0

        @cached(ttl=60, key="probe:cached-ok:{name}")
        async def build(*, name: str) -> dict:
            nonlocal calls
            calls += 1
            return {"name": name}

        first = await build(name="b")
        second = await build(name="b")

        assert first == second == {"name": "b"}
        assert calls == 1, "second call should have been served from the cache"


@pytest.mark.parametrize("value", [ValueError("boom"), object()])
async def test_cache_set_json_never_raises_for_odd_values(fake_redis, value):
    """Belt-and-braces: any odd value, one entry point, no exception."""
    await cache_set_json("probe:odd", value)  # type: ignore[arg-type]
