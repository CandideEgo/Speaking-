"""Tests for Phase 2 — standard version + fork (per-URL dedup).

Covers:
- ``_register_standard``: first-ready-wins (ON CONFLICT DO NOTHING on source_url PK).
- ``submit_video``: same-URL submission forks from the standard (subtitles +
  practice + metadata copied, ``forked_from`` set, no GPU re-run).
- ``submit_video`` with no standard → still ``pending_processing`` (no regression).
- ``POST /videos/{id}/fork``: copies subtitles + practice, born ready.
- fork guards: non-ready source → 400; missing source → 404.
"""

from unittest.mock import patch

from httpx import AsyncClient
from sqlalchemy import select

from app.models.practice import VideoPracticeQuestion
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus
from app.models.video_standard import VideoStandard


async def _owner_id(db) -> str:
    user = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
    return user.id


async def _make_ready_video(db, *, owner_id: str, source_url: str, with_content: bool = True) -> Video:
    """Create a ready video with subtitles + a practice set (a standard, once registered)."""
    v = Video(
        title="Standard Source",
        source_url=source_url,
        video_source="imported",
        status=VideoStatus.ready,
        is_official=False,
        is_published=False,
        review_status=VideoReviewStatus.draft.value,
        user_id=owner_id,
        auto_publish=False,
        video_url_720p=f"/media/{abs(hash(source_url)) % 100000}.mp4",
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    if with_content:
        for i in range(3):
            db.add(
                Subtitle(
                    video_id=v.id,
                    start_time=float(i),
                    end_time=float(i + 1),
                    text_en=f"line {i}",
                    text_zh=f"行 {i}",
                    sentence_index=i,
                    word_levels={"line": ["cet4"]},
                )
            )
        db.add(
            VideoPracticeQuestion(
                video_id=v.id,
                exam_level="cet4",
                questions=[{"type": "qa", "question": "Q", "answer": "A"}],
                question_count=1,
            )
        )
        await db.commit()
    return v


async def _register_standard(db, video: Video) -> None:
    db.add(VideoStandard(source_url=video.source_url, canonical_video_id=video.id))
    await db.commit()


class TestRegisterStandard:
    """``_register_standard`` enforces one standard per source_url (first-ready-wins)."""

    async def test_first_ready_wins_on_conflict(self, auth_headers: dict):
        # auth_headers fixture creates the test user (side-effect dependency).
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=register_test"
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v1 = await _make_ready_video(db, owner_id=owner, source_url=url)

            from app.tasks.video_processing import _register_standard

            await _register_standard(db, v1)
            stds = (await db.execute(select(VideoStandard).where(VideoStandard.source_url == url))).scalars().all()
            assert len(stds) == 1
            assert stds[0].canonical_video_id == v1.id

            # A second ready video for the same URL must NOT replace the standard.
            v2 = await _make_ready_video(db, owner_id=owner, source_url=url)
            await _register_standard(db, v2)
            await db.refresh(v1)
            stds = (await db.execute(select(VideoStandard).where(VideoStandard.source_url == url))).scalars().all()
            assert len(stds) == 1
            assert stds[0].canonical_video_id == v1.id


class TestSubmitVideoForksFromStandard:
    """``submit_video`` forks from the standard instead of re-running GPU."""

    async def test_submit_forks_subtitles_practice_no_gpu(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=submit_fork_test"
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            standard = await _make_ready_video(db, owner_id=owner, source_url=url)
            await _register_standard(db, standard)
            standard_id = standard.id

        with patch("app.tasks.video_processing.process_video") as mock_pv:
            resp = await client.post("/api/v1/videos", json={"source_url": url}, headers=auth_headers)
            mock_pv.delay.assert_not_called()  # fork must not enqueue GPU

        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "ready"
        vid = data["id"]

        async with TestSessionLocal() as db:
            v = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v.status == VideoStatus.ready
            assert v.forked_from == standard_id
            assert v.user_id != standard_id  # owned by the submitter, not the standard's owner
            subs = (await db.execute(select(Subtitle).where(Subtitle.video_id == vid))).scalars().all()
            assert len(subs) == 3
            assert subs[0].text_zh == "行 0"  # translation copied, not just raw English
            assert subs[0].word_levels == {"line": ["cet4"]}  # annotations copied
            qs = (
                (await db.execute(select(VideoPracticeQuestion).where(VideoPracticeQuestion.video_id == vid)))
                .scalars()
                .all()
            )
            assert len(qs) == 1
            assert qs[0].exam_level == "cet4"

    async def test_submit_no_standard_creates_pending(self, client: AsyncClient, auth_headers: dict):
        """No standard for this URL → falls through to pending_processing (no regression)."""
        url = "https://www.youtube.com/watch?v=no_standard_test"
        with patch("app.tasks.video_processing.process_video") as mock_pv:
            resp = await client.post("/api/v1/videos", json={"source_url": url}, headers=auth_headers)
            mock_pv.delay.assert_not_called()  # pending rows wait for admin start-processing
        assert resp.status_code == 201
        assert resp.json()["status"] == "pending_processing"


class TestForkApi:
    """``POST /videos/{id}/fork`` copies subtitles + practice into a ready fork."""

    async def test_fork_copies_subtitles_and_practice(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        url = "https://www.youtube.com/watch?v=fork_api_test"
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            source = await _make_ready_video(db, owner_id=owner, source_url=url)
            source_id = source.id
            source_720 = source.video_url_720p

        resp = await client.post(f"/api/v1/videos/{source_id}/fork", headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "ready"
        vid = data["id"]

        async with TestSessionLocal() as db:
            v = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v.forked_from == source_id
            assert v.video_url_720p == source_720  # shared media file (扩展 E1)
            subs = (await db.execute(select(Subtitle).where(Subtitle.video_id == vid))).scalars().all()
            assert len(subs) == 3
            qs = (
                (await db.execute(select(VideoPracticeQuestion).where(VideoPracticeQuestion.video_id == vid)))
                .scalars()
                .all()
            )
            assert len(qs) == 1

    async def test_fork_non_ready_400(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = Video(
                title="Pending",
                source_url="https://example.com/pending.mp4",
                video_source="local",
                status=VideoStatus.pending_processing,
                is_official=False,
                is_published=False,
                review_status=VideoReviewStatus.draft.value,
                user_id=owner,
            )
            db.add(v)
            await db.commit()
            await db.refresh(v)
            vid = v.id

        resp = await client.post(f"/api/v1/videos/{vid}/fork", headers=auth_headers)
        assert resp.status_code == 400

    async def test_fork_not_found_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/v1/videos/nonexistent/fork", headers=auth_headers)
        assert resp.status_code == 404
