"""Tests for failed-download retry + localize strike logic (阶段 3)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select

from app.models.video import Video, VideoStatus
from tests.conftest import TestSessionLocal


async def _patch_async_session(monkeypatch):
    """Point app.core.database.async_session at the test SQLite engine."""
    import app.core.database as db_mod

    monkeypatch.setattr(db_mod, "async_session", TestSessionLocal)


class TestRetryFailedDownloads:
    """_run_retry_failed_downloads selects only ready imported videos under the strike limit."""

    @pytest.mark.asyncio
    async def test_selects_under_strike_limit(self, db_session, monkeypatch):
        await _patch_async_session(monkeypatch)
        import app.tasks.video_processing as vp

        mock_loc = MagicMock()
        monkeypatch.setattr(vp, "localize_video", mock_loc)
        monkeypatch.setattr(
            "app.services.youtube_cookies_service.ensure_cookies_for_pipeline",
            AsyncMock(),
        )
        from app.tasks.video_processing import _run_retry_failed_downloads

        v1 = Video(  # under limit -> candidate
            title="r1",
            source_url="https://youtube.com/1",
            video_source="imported",
            status=VideoStatus.ready,
            video_url_720p=None,
            download_failed_at=datetime.now(UTC),
            download_fail_count=1,
        )
        v2 = Video(  # at limit -> skipped
            title="r2",
            source_url="https://youtube.com/2",
            video_source="imported",
            status=VideoStatus.ready,
            video_url_720p=None,
            download_failed_at=datetime.now(UTC),
            download_fail_count=3,
        )
        v3 = Video(  # no failure recorded -> skipped
            title="r3",
            source_url="https://youtube.com/3",
            video_source="imported",
            status=VideoStatus.ready,
            video_url_720p=None,
            download_failed_at=None,
            download_fail_count=0,
        )
        db_session.add_all([v1, v2, v3])
        await db_session.commit()

        await _run_retry_failed_downloads()

        dispatched = [c.args[0] for c in mock_loc.delay.call_args_list]
        assert v1.id in dispatched
        assert v2.id not in dispatched
        assert v3.id not in dispatched

    @pytest.mark.asyncio
    async def test_refreshes_cookies_before_dispatch(self, db_session, monkeypatch):
        await _patch_async_session(monkeypatch)
        import app.tasks.video_processing as vp

        monkeypatch.setattr(vp, "localize_video", MagicMock())
        cookie_mock = AsyncMock()
        monkeypatch.setattr(
            "app.services.youtube_cookies_service.ensure_cookies_for_pipeline",
            cookie_mock,
        )
        from app.tasks.video_processing import _run_retry_failed_downloads

        v = Video(
            title="cookie",
            source_url="https://youtube.com/c",
            video_source="imported",
            status=VideoStatus.ready,
            video_url_720p=None,
            download_failed_at=datetime.now(UTC),
            download_fail_count=0,
        )
        db_session.add(v)
        await db_session.commit()

        await _run_retry_failed_downloads()

        cookie_mock.assert_awaited_once_with(v.source_url)


class TestLocalizeDownloadFailure:
    """_run_localize records download failures and respects the strike limit."""

    @pytest.mark.asyncio
    async def test_download_failure_records_and_stays_ready(self, db_session, monkeypatch):
        await _patch_async_session(monkeypatch)
        import app.tasks.video_processing as vp

        monkeypatch.setattr(vp, "acquire_lock", lambda vid: True)
        monkeypatch.setattr(vp, "_download_video", AsyncMock(return_value=None))
        from app.tasks.video_processing import _run_localize

        v = Video(
            title="dl",
            source_url="https://youtube.com/x",
            video_source="imported",
            status=VideoStatus.processing,
            video_url_720p=None,
            download_fail_count=0,
        )
        db_session.add(v)
        await db_session.commit()
        vid = v.id

        await _run_localize(MagicMock(), vid, force=False)

        async with TestSessionLocal() as db:
            fetched = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert fetched.status == VideoStatus.ready  # stayed playable
            assert fetched.download_failed_at is not None
            assert fetched.download_fail_count == 1

    @pytest.mark.asyncio
    async def test_strike_skips_localize(self, db_session, monkeypatch):
        await _patch_async_session(monkeypatch)
        import app.tasks.video_processing as vp

        monkeypatch.setattr(vp, "acquire_lock", lambda vid: True)
        mock_dl = AsyncMock(return_value="/fake/path")
        monkeypatch.setattr(vp, "_download_video", mock_dl)
        from app.tasks.video_processing import _run_localize

        v = Video(
            title="strike",
            source_url="https://youtube.com/x",
            video_source="imported",
            status=VideoStatus.ready,
            video_url_720p=None,
            download_fail_count=3,
        )
        db_session.add(v)
        await db_session.commit()

        await _run_localize(MagicMock(), v.id, force=False)

        mock_dl.assert_not_called()  # strike -> skip before download

    @pytest.mark.asyncio
    async def test_force_bypasses_strike(self, db_session, monkeypatch):
        await _patch_async_session(monkeypatch)
        import app.tasks.video_processing as vp

        monkeypatch.setattr(vp, "acquire_lock", lambda vid: True)
        mock_dl = AsyncMock(return_value=None)
        monkeypatch.setattr(vp, "_download_video", mock_dl)
        from app.tasks.video_processing import _run_localize

        v = Video(
            title="force",
            source_url="https://youtube.com/x",
            video_source="imported",
            status=VideoStatus.processing,
            video_url_720p=None,
            download_fail_count=3,
        )
        db_session.add(v)
        await db_session.commit()

        await _run_localize(MagicMock(), v.id, force=True)

        mock_dl.assert_called_once()  # force bypassed the strike limit
