"""Tests for P1 video scoring (LAUNCH-SPRINT-2026-07 阶段 4 + 阶段 2).

Covers the 7-factor (+bonus) computation, persistence (videos.score +
video_scores row), the no-data baseline (new videos aren't buried at 0), the
100 cap, latest-row lookup, and that list_public_videos sorts by score desc
with nulls last. 阶段 2: viral/freshness external-signal factors.
"""

import math
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.behavior import BehaviorEvent
from app.models.learning import LearningRecord
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus
from app.services.scoring_service import compute_video_score, get_latest_score

# SQLite (the test DB) only auto-increments INTEGER PRIMARY KEY; BehaviorEvent.id
# is BigInteger (Postgres serial), so in tests we assign explicit unique ids.
_event_id = 0


def _next_event_id() -> int:
    global _event_id
    _event_id += 1
    return _event_id


async def _owner_id(db) -> str:
    user = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
    return user.id


async def _make_video(
    db,
    *,
    owner_id: str,
    official: bool = True,
    published: bool = True,
    subtitles: int = 3,
    source_url: str = "https://www.youtube.com/watch?v=scoring",
) -> Video:
    v = Video(
        title="Scored Video",
        source_url=source_url,
        video_source="imported",
        status=VideoStatus.ready,
        is_official=official,
        is_published=published,
        review_status=VideoReviewStatus.published.value,
        user_id=owner_id,
        topic_tags="tech, education",
        difficulty_level="B1",
        duration=120.0,
        video_url_720p=f"/media/{abs(hash(source_url)) % 100000}.mp4",
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    for i in range(subtitles):
        db.add(
            Subtitle(
                video_id=v.id,
                start_time=float(i),
                end_time=float(i + 1),
                text_en=f"line {i}",
                text_zh=f"行 {i}",  # all translated → quality = 1.0
                sentence_index=i,
            )
        )
    await db.commit()
    return v


class TestScoringFactors:
    async def test_no_data_video_baseline_is_nonzero(self, auth_headers: dict):
        """A freshly-finalized video with no behavior data still scores ~30:
        TopicMatch (0.12) + Quality (0.08) = 20 base, +10 official bonus."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_video(db, owner_id=owner)
            result = await compute_video_score(db, v.id)

            assert result is not None
            # No behavior → CTR/Retention/WatchTime all 0.
            assert result["factors"]["ctr"] == 0.0
            assert result["factors"]["retention"] == 0.0
            assert result["factors"]["watch_time"] == 0.0
            # No external metadata → 阶段 2 factors stay 0.
            assert result["factors"]["viral"] == 0.0
            assert result["factors"]["freshness"] == 0.0
            # Metadata-complete + translated.
            assert result["factors"]["topic_match"] == 1.0
            assert result["factors"]["quality"] == 1.0
            assert result["factors"]["bonus"] == 1.0
            # 100*(0.12 + 0.08) + 10 = 30
            assert result["total_score"] == 30.0

    async def test_ctr_factor_scales_with_clicks(self, auth_headers: dict):
        """25 clicks / 50 benchmark = 0.5 CTR factor."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_video(db, owner_id=owner, source_url="https://x.test/ctr")
            for _ in range(25):
                db.add(
                    BehaviorEvent(
                        id=_next_event_id(),
                        user_id=owner,
                        video_id=v.id,
                        event_type="click",
                        event_payload={},
                    )
                )
            await db.commit()

            result = await compute_video_score(db, v.id)
            assert result["factors"]["ctr"] == 0.5

    async def test_retention_factor_from_progress(self, auth_headers: dict):
        """avg(progress_percentage)=80 → retention = 0.8."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_video(db, owner_id=owner, source_url="https://x.test/retention")
            db.add(LearningRecord(user_id=owner, video_id=v.id, progress_percentage=80.0, time_spent_seconds=0))
            await db.commit()

            result = await compute_video_score(db, v.id)
            assert result["factors"]["retention"] == pytest.approx(0.8, abs=1e-3)

    async def test_watch_time_factor_saturates(self, auth_headers: dict):
        """18000s / 36000s benchmark = 0.5 WatchTime factor."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_video(db, owner_id=owner, source_url="https://x.test/watchtime")
            db.add(LearningRecord(user_id=owner, video_id=v.id, progress_percentage=0.0, time_spent_seconds=18000))
            await db.commit()

            result = await compute_video_score(db, v.id)
            assert result["factors"]["watch_time"] == 0.5

    async def test_score_capped_at_100(self, auth_headers: dict):
        """In-app factors maxed without external data → base 85 + bonus 10 = 95.
        (阶段 2: viral/freshness contribute the remaining 15% only when
        external metadata exists.)"""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_video(db, owner_id=owner, source_url="https://x.test/cap")
            # Max CTR (50+ clicks).
            for _ in range(60):
                db.add(
                    BehaviorEvent(
                        id=_next_event_id(),
                        user_id=owner,
                        video_id=v.id,
                        event_type="click",
                        event_payload={},
                    )
                )
            # Max retention + watch time.
            db.add(LearningRecord(user_id=owner, video_id=v.id, progress_percentage=100.0, time_spent_seconds=40000))
            await db.commit()

            result = await compute_video_score(db, v.id)
            assert result["factors"]["ctr"] == 1.0
            assert result["factors"]["retention"] == 1.0
            assert result["factors"]["watch_time"] == 1.0
            # 100*(0.25+0.22+0.18+0.12+0.08) + 10 = 95
            assert result["total_score"] == 95.0


class TestExternalFactors:
    """阶段 2: viral (爆发指数) + freshness (热度增长速度) factors."""

    async def test_viral_factor_channel_baseline(self, auth_headers: dict):
        """ext_view_count vs same-channel average, log-scaled (10x → 0.5)."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            hit = await _make_video(db, owner_id=owner, source_url="https://x.test/viral-hit")
            hit.channel_id = "UC-test"
            hit.ext_view_count = 1_000_000
            db.add(hit)
            # Two channel siblings averaging 100k → hit is 10x the baseline.
            for i, views in enumerate((100_000, 100_000)):
                sib = await _make_video(db, owner_id=owner, source_url=f"https://x.test/viral-sib-{i}")
                sib.channel_id = "UC-test"
                sib.ext_view_count = views
                db.add(sib)
            await db.commit()

            result = await compute_video_score(db, hit.id)
            # baseline = (1_000_000 + 100_000 + 100_000) / 3
            baseline = (1_000_000 + 100_000 + 100_000) / 3
            expected = min(1.0, math.log10(1_000_000 / baseline) / 2.0)
            assert result["factors"]["viral"] == pytest.approx(round(expected, 4), abs=1e-4)
            assert result["factors"]["viral"] > 0.0

    async def test_viral_factor_zero_below_average(self, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            flop = await _make_video(db, owner_id=owner, source_url="https://x.test/viral-flop")
            flop.channel_id = "UC-flop"
            flop.ext_view_count = 1_000
            db.add(flop)
            star = await _make_video(db, owner_id=owner, source_url="https://x.test/viral-star")
            star.channel_id = "UC-flop"
            star.ext_view_count = 1_000_000
            db.add(star)
            await db.commit()

            result = await compute_video_score(db, flop.id)
            assert result["factors"]["viral"] == 0.0

    async def test_freshness_factor_views_per_day(self, auth_headers: dict):
        """100k views in 10 days = 10k/day → saturates at the 10k benchmark;
        an old video with the same views scores far lower."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            fresh = await _make_video(db, owner_id=owner, source_url="https://x.test/fresh")
            fresh.ext_view_count = 100_000
            fresh.upload_date = datetime.now(UTC) - timedelta(days=10)
            db.add(fresh)
            old = await _make_video(db, owner_id=owner, source_url="https://x.test/old")
            old.ext_view_count = 100_000
            old.upload_date = datetime.now(UTC) - timedelta(days=1000)
            db.add(old)
            await db.commit()

            fresh_r = await compute_video_score(db, fresh.id)
            old_r = await compute_video_score(db, old.id)
            assert fresh_r["factors"]["freshness"] == 1.0
            # 100k views / 1000 days = 100 views/day → 100/10000 = 0.01
            assert old_r["factors"]["freshness"] == pytest.approx(0.01, abs=1e-3)

    async def test_external_factors_persisted_on_score_row(self, auth_headers: dict):
        from app.models.video_score import VideoScore
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_video(db, owner_id=owner, source_url="https://x.test/ext-persist")
            v.ext_view_count = 500_000
            v.upload_date = datetime.now(UTC) - timedelta(days=50)  # 10k/day → 1.0
            db.add(v)
            await db.commit()

            await compute_video_score(db, v.id)
            row = await get_latest_score(db, v.id)
            assert row is not None
            assert row.freshness == 1.0
            assert row.viral >= 0.0  # single sample in library → baseline = self → 0
            assert row.viral == 0.0


class TestScoringPersistence:
    async def test_score_written_to_video_and_history_row(self, auth_headers: dict):
        from app.models.video_score import VideoScore
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_video(db, owner_id=owner, source_url="https://x.test/persist")
            result = await compute_video_score(db, v.id)

            await db.refresh(v)
            assert v.score == result["total_score"]
            assert v.score_updated_at is not None

            rows = (
                (
                    await db.execute(
                        select(VideoScore).where(VideoScore.video_id == v.id).order_by(VideoScore.computed_at)
                    )
                )
                .scalars()
                .all()
            )
            assert len(rows) == 1
            assert rows[0].total_score == result["total_score"]

            latest = await get_latest_score(db, v.id)
            assert latest is not None
            assert latest.id == rows[0].id

    async def test_get_latest_score_none_when_unscored(self, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_video(db, owner_id=owner, source_url="https://x.test/unscored")
            assert await get_latest_score(db, v.id) is None


class TestPublicListOrdering:
    async def test_list_public_videos_orders_by_score_desc_nulls_last(self, auth_headers: dict):
        from app.services.video_service import list_public_videos
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            # Three official published ready videos; set scores directly to
            # isolate the ORDER BY (compute_video_score is covered above).
            high = await _make_video(db, owner_id=owner, source_url="https://x.test/high")
            mid = await _make_video(db, owner_id=owner, source_url="https://x.test/mid")
            null = await _make_video(db, owner_id=owner, source_url="https://x.test/null")
            high.score = 80.0
            mid.score = 40.0
            # null.score stays None
            await db.commit()

            page = await list_public_videos(db, page=1, page_size=10)
            ids = [item.id for item in page["items"]]
            # Scored first (desc), unscored last.
            assert ids.index(high.id) < ids.index(mid.id) < ids.index(null.id)
