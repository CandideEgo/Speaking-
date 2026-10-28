"""A warm subtitle cache must not freeze real metadata or engagement totals."""

import uuid
from datetime import UTC, datetime

from app.core.cache import cache_get
from app.models.video import Video, VideoStatus
from app.services.video_cache import invalidate_video_detail_cache
from tests.conftest import TestSessionLocal


async def test_warm_detail_and_feed_follow_favorites_and_likes(client, auth_headers, fake_redis):
    async with TestSessionLocal() as db:
        video = Video(
            id=str(uuid.uuid4()),
            title="Actual metadata test",
            source_url="https://example.com/video.mp4",
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            video_url_720p="/media/test.mp4",
            upload_date=datetime(2021, 1, 18, tzinfo=UTC),
            published_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        db.add(video)
        await db.commit()
        vid = video.id
    path = f"/api/v1/videos/{vid}"
    initial = await client.get(path, headers=auth_headers)
    assert initial.status_code == 200
    assert initial.json()["upload_date"].startswith("2021-01-18")
    assert initial.json()["published_at"].startswith("2026-01-01")
    assert await cache_get(f"video:detail:{vid}")
    await client.get("/api/v1/browse/feed")
    assert (await client.post(f"{path}/favorite", headers=auth_headers)).status_code == 200
    assert (await client.post(f"{path}/like", headers=auth_headers)).status_code == 200
    warm = (await client.get(path, headers=auth_headers)).json()
    assert (warm["favorite_count"], warm["like_count"]) == (1, 1)
    feed = (await client.get("/api/v1/browse/feed")).json()["items"]
    assert next(v for v in feed if v["id"] == vid)["favorite_count"] == 1
    await client.delete(f"{path}/favorite", headers=auth_headers)
    warm = (await client.get(path, headers=auth_headers)).json()
    assert warm["favorite_count"] == 0
    await client.post("/api/v1/behavior/events", headers=auth_headers, json={"event_type": "complete", "video_id": vid})
    warm = (await client.get(path, headers=auth_headers)).json()
    assert warm["view_count"] == 1
    feed = (await client.get("/api/v1/browse/feed")).json()["items"]
    assert next(v for v in feed if v["id"] == vid)["view_count"] == 1


async def test_viewer_scoped_access_is_not_cached(client, auth_headers, fake_redis, monkeypatch):
    """A future per-user quota must not reuse the shared detail cache key.

    Today ``remaining_this_month`` is always None; if that changes, the payload
    becomes viewer-dependent and caching it under ``video:detail:{id}`` would
    leak one user's remaining quota to another.
    """
    from app.services import unlock_service

    async def scoped_access(_db, _user, _video):
        return {"unlocked": True, "remaining_this_month": 3, "quota": 5}

    monkeypatch.setattr(unlock_service, "get_video_access_info", scoped_access)

    async with TestSessionLocal() as db:
        video = Video(
            id=str(uuid.uuid4()),
            title="Viewer scoped access",
            source_url="https://example.com/viewer-scoped.mp4",
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            video_url_720p="/media/test.mp4",
        )
        db.add(video)
        await db.commit()
        vid = video.id

    resp = await client.get(f"/api/v1/videos/{vid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["access"]["remaining_this_month"] == 3
    assert await cache_get(f"video:detail:{vid}") is None


async def test_detail_invalidation_uses_sync_redis_accessor(fake_redis):
    await fake_redis.set("video:detail:one", "cached")
    await invalidate_video_detail_cache("one")
    assert await fake_redis.get("video:detail:one") is None
