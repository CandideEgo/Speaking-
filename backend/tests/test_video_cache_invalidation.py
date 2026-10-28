"""Precise browse-cache invalidation for like/favorite/view (BE-13).

Any like, favorite or completion used to call ``invalidate_browse_cache()``,
deleting every ``browse:feed:*``, ``browse:featured:*`` and
``rankings:snapshot:*`` key. Home/browse caches were therefore cold-started by
ordinary user activity, and the 48h ranking snapshots were effectively never
alive. These tests pin the exact key families each interaction may drop.
"""

from __future__ import annotations

import pytest

import app.services.video_cache as vc


@pytest.fixture
def deleted(monkeypatch):
    """Record cache_delete() patterns instead of touching Redis."""
    patterns: list[str] = []

    async def fake_delete(pattern: str) -> None:
        patterns.append(pattern)

    monkeypatch.setattr(vc, "cache_delete", fake_delete)
    return patterns


@pytest.fixture
def detail_calls(monkeypatch):
    ids: list[str] = []

    async def fake_detail(video_id: str) -> None:
        ids.append(video_id)

    monkeypatch.setattr(vc, "invalidate_video_detail_cache", fake_detail)
    return ids


async def test_like_drops_detail_featured_and_feed_but_not_rankings(deleted, detail_calls):
    await vc.invalidate_like_caches("video-1")

    assert detail_calls == ["video-1"]
    assert set(deleted) == {"browse:featured:*", "browse:feed:*"}
    assert "rankings:snapshot:*" not in deleted


async def test_favorite_drops_feed_but_only_weekly_favorites_ranking(deleted, detail_calls):
    await vc.invalidate_favorite_caches("video-2")

    assert detail_calls == ["video-2"]
    assert set(deleted) == {
        "browse:featured:*",
        "browse:feed:*",
        "rankings:snapshot:*:weekly_favorites",
    }
    # A favorite cannot change the latest or weekly-views ranking snapshots.
    assert "rankings:snapshot:*" not in deleted


async def test_view_drops_feed_but_only_weekly_views_ranking(deleted, detail_calls):
    await vc.invalidate_view_caches("video-3")

    assert detail_calls == ["video-3"]
    assert set(deleted) == {
        "browse:featured:*",
        "browse:feed:*",
        "rankings:snapshot:*:weekly_views",
    }
    assert "rankings:snapshot:*" not in deleted


async def test_structural_invalidation_still_clears_everything(deleted, detail_calls):
    await vc.invalidate_browse_cache()

    assert detail_calls == []
    assert deleted == [
        "browse:feed:*",
        "browse:featured:*",
        "rankings:snapshot:*",
    ]
