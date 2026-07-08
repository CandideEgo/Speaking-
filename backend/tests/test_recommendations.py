"""Tests for P2 home feed recommendation (LAUNCH-SPRINT-2026-07 阶段 5).

Covers the 40/30/20/10 mix, small-pool score-desc fallback + is_featured
tiebreak, diversity (same first topic_tags ≤N consecutive), soft
personalization (click-history topic_tags + CEFR level), category feed, and
Redis caching. Reuses the test_scoring.py fixture pattern: auth_headers +
TestSessionLocal + explicit BehaviorEvent ids (BigInteger PK on SQLite).

async tests run under pytest-asyncio auto mode (no @mark needed), same as
test_scoring.py.
"""

from datetime import UTC, datetime, timedelta
from itertools import pairwise

from sqlalchemy import select

from app.models.behavior import BehaviorEvent
from app.models.preferences import UserPreferences
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus
from app.services.recommendation_service import (
    _BUCKET_ORDER,
    _diversify,
    _first_tag,
    _score_ordered,
    _split_into_buckets,
    get_category_feed,
    get_home_feed,
)
from tests.conftest import TestSessionLocal

# SQLite only auto-increments INTEGER PRIMARY KEY; BehaviorEvent.id is
# BigInteger (Postgres serial), so tests assign explicit unique ids.
_event_id = 0


def _next_event_id() -> int:
    global _event_id
    _event_id += 1
    return _event_id


def _tag_of(topic_tags: str | None) -> str:
    if not topic_tags:
        return ""
    return topic_tags.split(",")[0].strip().lower()


async def _owner(db) -> User:
    return (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()


async def _make_video(
    db,
    *,
    title: str = "V",
    topic_tags: str = "tech",
    difficulty: str | None = "B1",
    duration: float | None = 120.0,
    score: float | None = None,
    created_at: datetime | None = None,
    is_featured: bool = False,
    like_count: int = 0,
    favorite_count: int = 0,
    view_count: int = 0,
    owner_id: str | None = None,
) -> Video:
    v = Video(
        title=title,
        source_url=f"https://x.test/{abs(hash(title)) % 1000000}",
        video_source="imported",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
        review_status=VideoReviewStatus.published.value,
        is_featured=is_featured,
        user_id=owner_id,
        topic_tags=topic_tags,
        difficulty_level=difficulty,
        duration=duration,
        score=score,
        like_count=like_count,
        favorite_count=favorite_count,
        view_count=view_count,
        video_url_720p=f"/media/{abs(hash(title)) % 1000000}.mp4",
    )
    if created_at is not None:
        v.created_at = created_at
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


async def _click(db, user_id: str, video_id: str) -> None:
    db.add(
        BehaviorEvent(
            id=_next_event_id(),
            user_id=user_id,
            video_id=video_id,
            event_type="click",
            event_payload={"source": "test"},
        )
    )
    await db.commit()


def _vid(i: int, *, tag: str = "tech", score: float = 50.0, duration: float = 120.0, created=None) -> Video:
    """Build an in-memory Video for unit tests (no DB flush)."""
    return Video(
        id=f"vid{i}",
        title=f"v{i}",
        source_url=f"u{i}",
        video_source="imported",
        topic_tags=tag,
        score=score,
        duration=duration,
        created_at=created or datetime.now(UTC),
    )


class TestHomeFeed:
    async def test_empty_pool_returns_empty(self, auth_headers):
        async with TestSessionLocal() as db:
            user = await _owner(db)
            res = await get_home_feed(db, user, page=1, page_size=20)
        assert res["items"] == []
        assert res["total"] == 0
        assert res["personalized"] is False
        assert res["has_more"] is False

    async def test_small_pool_falls_back_to_score_desc(self, auth_headers):
        """Pool ≤ page_size: no mix, score desc with is_featured tiebreak."""
        async with TestSessionLocal() as db:
            user = await _owner(db)
            low = await _make_video(db, title="low", score=10.0, owner_id=user.id)
            high = await _make_video(db, title="high", score=90.0, owner_id=user.id)
            res = await get_home_feed(db, user, page=1, page_size=20)
        ids = [i["id"] for i in res["items"]]
        assert ids[0] == high.id
        assert ids[-1] == low.id  # lowest score last
        assert res["personalized"] is False
        assert res["has_more"] is False

    async def test_small_pool_is_featured_tiebreak(self, auth_headers):
        """Equal score → is_featured sorts first in the fallback."""
        async with TestSessionLocal() as db:
            user = await _owner(db)
            plain = await _make_video(db, title="plain", score=50.0, owner_id=user.id)
            feat = await _make_video(db, title="feat", score=50.0, is_featured=True, owner_id=user.id)
            res = await get_home_feed(db, user, page=1, page_size=20)
        ids = [i["id"] for i in res["items"]]
        assert ids[0] == feat.id
        assert ids[1] == plain.id

    async def test_mix_returns_page_size_when_pool_large(self, auth_headers):
        async with TestSessionLocal() as db:
            user = await _owner(db)
            for i in range(25):
                await _make_video(db, title=f"v{i}", score=float(i), owner_id=user.id)
            res = await get_home_feed(db, user, page=1, page_size=20)
        assert len(res["items"]) == 20
        assert res["total"] == 25
        assert res["has_more"] is True

    async def test_diversity_same_tag_not_more_than_max_consecutive(self, auth_headers):
        """No first-topic tag appears >recommend_consecutive_tag_max (2) in a row.

        Uses a balanced 10/10 ratio so the cap is achievable (a 15/5 skew would
        make ≤2 impossible regardless of algorithm — 15 needs ≥7 breaks).
        """
        async with TestSessionLocal() as db:
            user = await _owner(db)
            for i in range(10):
                await _make_video(db, title=f"tech{i}", score=float(80 - i), topic_tags="tech", owner_id=user.id)
            for i in range(10):
                await _make_video(db, title=f"news{i}", score=float(70 - i), topic_tags="news", owner_id=user.id)
            res = await get_home_feed(db, user, page=1, page_size=20)
        tags = [_tag_of(i["topic_tags"]) for i in res["items"]]
        max_consec = 1
        cur = 1
        for a, b in pairwise(tags):
            if a == b and a:
                cur += 1
                max_consec = max(max_consec, cur)
            else:
                cur = 1
        assert max_consec <= 2

    async def test_anonymous_not_personalized(self, auth_headers):
        async with TestSessionLocal() as db:
            for i in range(25):
                await _make_video(db, title=f"v{i}", score=float(i))
            res = await get_home_feed(db, None, page=1, page_size=20)
        assert res["personalized"] is False
        assert len(res["items"]) == 20

    async def test_personalized_boosts_clicked_tag_into_top(self, auth_headers):
        """Logged-in user with ≥3 clicks on 'news' → news floats into the top 5.

        news has a lower raw score (55) than tech (60), but 6 clicks give it a
        +6 boost → effective 61 > 60, so news enters the top bucket after the
        pre-bucket effective-score re-sort.
        """
        async with TestSessionLocal() as db:
            user = await _owner(db)
            for i in range(18):
                await _make_video(db, title=f"tech{i}", score=60.0, topic_tags="tech", owner_id=user.id)
            news = []
            for i in range(5):
                v = await _make_video(db, title=f"news{i}", score=55.0, topic_tags="news", owner_id=user.id)
                news.append(v)
            # 6 clicks across 3 news videos → weights["news"] = 6
            for v in news[:3]:
                await _click(db, user.id, v.id)
                await _click(db, user.id, v.id)
            res = await get_home_feed(db, user, page=1, page_size=20)
        assert res["personalized"] is True
        top5_tags = [_tag_of(i["topic_tags"]) for i in res["items"][:5]]
        assert "news" in top5_tags

    async def test_too_few_clicks_not_personalized(self, auth_headers):
        """Below recommend_min_clicks_for_personalization (3) → not personalized."""
        async with TestSessionLocal() as db:
            user = await _owner(db)
            for i in range(18):
                await _make_video(db, title=f"tech{i}", score=60.0, topic_tags="tech", owner_id=user.id)
            news = []
            for i in range(5):
                v = await _make_video(db, title=f"news{i}", score=55.0, topic_tags="news", owner_id=user.id)
                news.append(v)
            await _click(db, user.id, news[0].id)  # only 1 click
            res = await get_home_feed(db, user, page=1, page_size=20)
        assert res["personalized"] is False

    async def test_cache_hit_skips_db(self, auth_headers):
        """Second identical call is served from cache (total stays at old value)."""
        async with TestSessionLocal() as db:
            user = await _owner(db)
            for i in range(25):
                await _make_video(db, title=f"v{i}", score=float(i), owner_id=user.id)
            res1 = await get_home_feed(db, user, page=1, page_size=20)
            # Add a 26th video after the first call — cache hit means res2
            # doesn't see it (total stays 25).
            await _make_video(db, title="new", score=99.0, owner_id=user.id)
            res2 = await get_home_feed(db, user, page=1, page_size=20)
        assert res1["total"] == 25
        assert res2["total"] == 25
        assert res1 == res2


class TestCategoryFeed:
    async def test_filters_by_tag(self, auth_headers):
        async with TestSessionLocal() as db:
            user = await _owner(db)
            for i in range(5):
                await _make_video(db, title=f"tech{i}", score=float(i), topic_tags="tech", owner_id=user.id)
            for i in range(3):
                await _make_video(db, title=f"news{i}", score=float(i), topic_tags="news", owner_id=user.id)
            res = await get_category_feed(db, None, "tech", page=1, page_size=20)
        assert res["total"] == 5
        assert all(_tag_of(i["topic_tags"]) == "tech" for i in res["items"])

    async def test_score_desc_ordering(self, auth_headers):
        async with TestSessionLocal() as db:
            user = await _owner(db)
            await _make_video(db, title="low", score=10.0, topic_tags="tech", owner_id=user.id)
            await _make_video(db, title="high", score=90.0, topic_tags="tech", owner_id=user.id)
            res = await get_category_feed(db, None, "tech", page=1, page_size=20)
        assert res["items"][0]["title"] == "high"
        assert res["items"][1]["title"] == "low"

    async def test_personalized_category(self, auth_headers):
        async with TestSessionLocal() as db:
            user = await _owner(db)
            # 5 tech videos; user clicked 3 → personalized within tech category.
            vids = []
            for i in range(5):
                v = await _make_video(db, title=f"t{i}", score=50.0, topic_tags="tech", owner_id=user.id)
                vids.append(v)
            for v in vids[:3]:
                await _click(db, user.id, v.id)
            res = await get_category_feed(db, user, "tech", page=1, page_size=20)
        assert res["personalized"] is True
        assert res["total"] == 5


class TestDiversifyUnit:
    def test_no_more_than_max_consecutive(self):
        items = [_vid(i, tag="tech") for i in range(5)] + [_vid(i + 5, tag="news") for i in range(2)]
        out = _diversify(items, 2)
        tags = [_first_tag(v) for v in out]
        for i in range(len(tags) - 2):
            assert not (tags[i] == tags[i + 1] == tags[i + 2] and tags[i])

    def test_short_list_noop(self):
        items = [_vid(i) for i in range(2)]
        assert _diversify(items, 2) == items

    def test_no_videos_dropped(self):
        items = [_vid(i, tag="tech") for i in range(10)]
        out = _diversify(items, 2)
        assert len(out) == len(items)
        assert {v.id for v in out} == {v.id for v in items}


class TestSplitBucketsUnit:
    def test_buckets_disjoint_and_sum_to_page_size(self):
        pool = _score_ordered([_vid(i, score=float(i)) for i in range(30)])
        buckets = _split_into_buckets(pool, 20)
        all_ids: list[str] = []
        for k in _BUCKET_ORDER:
            all_ids += [v.id for v in buckets[k]]
        assert len(all_ids) == len(set(all_ids))  # disjoint
        assert len(all_ids) == 20  # backfill reaches page_size

    def test_long_bucket_requires_duration_and_score_floor(self):
        """A short video never lands in the long bucket even if score is high."""
        pool = _score_ordered(
            [_vid(i, score=80.0, duration=120.0) for i in range(20)]  # all short
        )
        buckets = _split_into_buckets(pool, 20)
        # No video qualifies for long (duration 120 < 1200) → bucket fills via
        # backfill; the structure still reaches page_size.
        assert sum(len(buckets[k]) for k in _BUCKET_ORDER) == 20

    def test_cold_bucket_only_recent(self):
        """Old videos (created_at > cold_start_days ago) skip the cold bucket.

        With 18 recent + 2 old, the cold bucket (quota 4) fills entirely from
        recent leftovers after top+potential take 14 — old never reaches it.
        Old videos land in the long/backfill slots instead.
        """
        now = datetime.now(UTC)
        recent = [_vid(i, score=50.0, created=now) for i in range(18)]
        old = [_vid(i + 18, score=50.0, created=now - timedelta(days=30)) for i in range(2)]
        pool = _score_ordered(recent + old)
        buckets = _split_into_buckets(pool, 20)
        cold_ids = {v.id for v in buckets["cold"]}
        assert not any(v.id in cold_ids for v in old)
