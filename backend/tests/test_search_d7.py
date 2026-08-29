"""Tests for D7 搜索体验增强：/videos/search/suggest + /videos/search/hot."""

import json

import pytest

from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus


async def _make_video(db, *, title: str, official=True, published=True, ready=True) -> Video:
    video = Video(
        title=title,
        source_url=f"https://example.com/{title}.mp4",
        video_source=VideoSource.imported,
        status=VideoStatus.ready if ready else VideoStatus.processing,
        review_status=VideoReviewStatus.published.value,
        is_official=official,
        is_published=published,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


# ── suggest ─────────────────────────────────────────────────────────────


async def test_suggest_returns_matching_titles(client, db_session):
    await _make_video(db_session, title="6 Tips on Being a Good Listener")
    await _make_video(db_session, title="How to Listen Better")
    await _make_video(db_session, title="Unrelated Cooking Show")

    resp = await client.get("/api/v1/videos/search/suggest", params={"q": "listen"})
    assert resp.status_code == 200
    suggestions = resp.json()["suggestions"]
    assert len(suggestions) == 2
    assert all("Listen" in t or "Listener" in t for t in suggestions)


async def test_suggest_prefix_match_ranks_first(client, db_session):
    await _make_video(db_session, title="How to TED Talk")  # contains only
    await _make_video(db_session, title="TED Talks on Focus")  # prefix

    resp = await client.get("/api/v1/videos/search/suggest", params={"q": "TED"})
    suggestions = resp.json()["suggestions"]
    assert suggestions[0] == "TED Talks on Focus"


async def test_suggest_excludes_unpublished_and_non_official(client, db_session):
    await _make_video(db_session, title="Visible Video")
    await _make_video(db_session, title="Hidden Draft", published=False)
    await _make_video(db_session, title="Hidden User Video", official=False)
    await _make_video(db_session, title="Hidden Processing", ready=False)

    resp = await client.get("/api/v1/videos/search/suggest", params={"q": "Hidden"})
    assert resp.json()["suggestions"] == []

    resp = await client.get("/api/v1/videos/search/suggest", params={"q": "Visible"})
    assert resp.json()["suggestions"] == ["Visible Video"]


async def test_suggest_empty_query_returns_empty(client):
    resp = await client.get("/api/v1/videos/search/suggest", params={"q": ""})
    assert resp.status_code == 200
    assert resp.json()["suggestions"] == []


async def test_suggest_respects_limit(client, db_session):
    for i in range(5):
        await _make_video(db_session, title=f"Repeat Topic {i}")

    resp = await client.get("/api/v1/videos/search/suggest", params={"q": "Repeat", "limit": 3})
    assert len(resp.json()["suggestions"]) == 3


# ── hot searches ────────────────────────────────────────────────────────


class _FakeRedis:
    """Minimal in-memory stand-in for the async Redis client."""

    def __init__(self):
        self.zset: dict[str, float] = {}
        self.cache: dict[str, str] = {}

    async def zincrby(self, key, amount, member):
        self.zset[member] = self.zset.get(member, 0.0) + amount

    async def zrevrange(self, key, start, end):
        ordered = sorted(self.zset.items(), key=lambda kv: kv[1], reverse=True)
        return [m for m, _ in ordered[start : end + 1]]

    async def get(self, key):
        return self.cache.get(key)

    async def set(self, key, value, ex=None):
        self.cache[key] = value
        return True


@pytest.fixture
def fake_redis(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr("app.core.redis.get_redis", lambda: fake)
    return fake


async def test_hot_falls_back_to_static_list_when_redis_down(client, monkeypatch):
    def _raise():
        raise ConnectionError("redis down (test)")

    monkeypatch.setattr("app.core.redis.get_redis", _raise)

    resp = await client.get("/api/v1/videos/search/hot")
    assert resp.status_code == 200
    hot = resp.json()["hot"]
    assert "TED Talks" in hot  # static fallback
    assert len(hot) <= 10


async def test_hot_returns_ranked_queries_from_redis(client, fake_redis):
    await fake_redis.zincrby("search:hot", 5, "面试")
    await fake_redis.zincrby("search:hot", 2, "发音")

    resp = await client.get("/api/v1/videos/search/hot")
    assert resp.json()["hot"] == ["面试", "发音"]


async def test_hot_caches_result_for_one_hour(client, fake_redis):
    await fake_redis.zincrby("search:hot", 3, "演讲")

    first = await client.get("/api/v1/videos/search/hot")
    assert first.json()["hot"] == ["演讲"]
    assert "search:hot:top" in fake_redis.cache
    assert json.loads(fake_redis.cache["search:hot:top"]) == ["演讲"]

    # Even after the ZSET changes, the cached value is served until TTL.
    await fake_redis.zincrby("search:hot", 9, "新词")
    second = await client.get("/api/v1/videos/search/hot")
    assert second.json()["hot"] == ["演讲"]


async def test_record_search_query_counts_and_skips_noise(fake_redis):
    from app.services.search_service import record_search_query

    await record_search_query("面试")
    await record_search_query("面试")
    await record_search_query("  ")  # blank → skipped
    await record_search_query("x" * 51)  # over-long → skipped

    assert fake_redis.zset == {"面试": 2.0}
