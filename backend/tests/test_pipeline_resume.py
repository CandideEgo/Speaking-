"""Tests for Phase 1 pipeline resume — ``retry_video`` smart continuation.

Covers the two resume branches introduced by the pipeline-resume rework:

- Errored video **with** subtitles → transcription succeeded on a prior run,
  so retry jumps straight to ``finalize_video`` (subtitles preserved, the
  Redis completed-step set kept so the tail skips already-finished work, and
  GPU transcription is NOT re-enqueued).
- Errored video **without** subtitles → transcription never produced output,
  so retry resets to ``pending_processing`` and clears the step set for a
  fresh full run; ``finalize_video`` is not dispatched.

Plus the non-error / not-found guards.
"""

from unittest.mock import patch

from httpx import AsyncClient
from sqlalchemy import select

from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus


async def _owner_id(db) -> str:
    user = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
    return user.id


async def _make_error_video(db, *, owner_id: str, with_subtitles: bool) -> Video:
    """Create a video in the ``error`` state, optionally with subtitle rows."""
    v = Video(
        title="Errored Pipeline",
        source_url="https://www.youtube.com/watch?v=resume_test",
        video_source="imported",
        status=VideoStatus.error,
        error_message="simulated transcription boom",
        processing_step=None,
        processing_progress=0,
        is_official=False,
        is_published=False,
        review_status=VideoReviewStatus.draft.value,
        user_id=owner_id,
        auto_publish=False,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    if with_subtitles:
        for i in range(3):
            db.add(
                Subtitle(
                    video_id=v.id,
                    start_time=float(i),
                    end_time=float(i + 1),
                    text_en=f"line {i}",
                    sentence_index=i,
                )
            )
        await db.commit()
    return v


class TestRetrySmartResume:
    """``retry_video`` preserves completed work and resumes from the tail."""

    async def test_retry_with_subtitles_dispatches_finalize(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        """Errored video with subtitles → resume from finalize, keep subtitles."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_error_video(db, owner_id=owner, with_subtitles=True)
            vid = v.id

        with patch("app.tasks.video_processing.finalize_video") as mock_fin:
            resp = await client.post(f"/api/v1/videos/admin/{vid}/retry", headers=admin_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready_subtitles"
        assert data["error_message"] is None
        # finalize_video.delay dispatched exactly once with this video id — the
        # tail picks up from translating, transcription is not re-enqueued.
        mock_fin.delay.assert_called_once_with(vid)

        async with TestSessionLocal() as db:
            v = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v.status == VideoStatus.ready_subtitles
            assert v.processing_step == "translating"
            # Subtitles preserved — not wiped by the retry.
            subs = (await db.execute(select(Subtitle).where(Subtitle.video_id == vid))).scalars().all()
            assert len(subs) == 3

    async def test_retry_without_subtitles_resets_to_pending(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        """Errored video with no subtitles → reset to pending_processing, no finalize."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _make_error_video(db, owner_id=owner, with_subtitles=False)
            vid = v.id

        with patch("app.tasks.video_processing.finalize_video") as mock_fin:
            resp = await client.post(f"/api/v1/videos/admin/{vid}/retry", headers=admin_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending_processing"
        # finalize_video must NOT be dispatched — no subtitles means transcription
        # never succeeded, so there is nothing to finalize. The admin re-triggers
        # via start-processing once ready.
        mock_fin.delay.assert_not_called()

        async with TestSessionLocal() as db:
            v = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v.status == VideoStatus.pending_processing
            assert v.processing_step is None
            assert v.processing_progress == 0
            assert v.error_message is None

    async def test_retry_rejects_non_error_video(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        """retry on a non-error video → 400 (use recover/start-processing instead)."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = Video(
                title="Not Error",
                source_url="https://example.com/processing.mp4",
                video_source="local",
                status=VideoStatus.processing,
                is_official=False,
                is_published=False,
                review_status=VideoReviewStatus.draft.value,
                user_id=owner,
            )
            db.add(v)
            await db.commit()
            await db.refresh(v)
            vid = v.id

        resp = await client.post(f"/api/v1/videos/admin/{vid}/retry", headers=admin_headers)
        assert resp.status_code == 400

    async def test_retry_not_found(self, client: AsyncClient, admin_headers: dict):
        """retry on a missing video → 404."""
        resp = await client.post("/api/v1/videos/admin/nonexistent-id/retry", headers=admin_headers)
        assert resp.status_code == 404
