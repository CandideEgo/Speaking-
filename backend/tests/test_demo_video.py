"""First-lesson demo video: single `is_demo` marker + `/videos/demo` contract."""

from httpx import AsyncClient
from sqlalchemy import select

from tests.conftest import TestSessionLocal


async def _seed_ready_video(db, *, title: str, is_demo: bool = False):
    from app.models.video import Video, VideoReviewStatus, VideoStatus

    video = Video(
        title=title,
        source_url=f"https://www.youtube.com/watch?v={abs(hash(title)) % 10**11:011d}",
        video_source="imported",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
        review_status=VideoReviewStatus.published.value,
        video_url_720p=f"/media/video-{title}.mp4",
        is_demo=is_demo,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


class TestDemoVideoEndpoint:
    async def test_requires_login(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos/demo")
        assert resp.status_code == 401

    async def test_404_when_no_video_is_marked(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/videos/demo", headers=auth_headers)
        assert resp.status_code == 404

    async def test_returns_marked_video(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="First Lesson", is_demo=True)
        resp = await client.get("/api/v1/videos/demo", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == video.id
        assert resp.json()["is_demo"] is True


class TestDemoVideoExclusivity:
    async def test_admin_toggle_clears_previous_demo(self, client: AsyncClient, admin_headers: dict, db_session):
        first = await _seed_ready_video(db_session, title="Demo A")
        second = await _seed_ready_video(db_session, title="Demo B")

        resp = await client.patch(
            f"/api/v1/videos/admin/{first.id}",
            headers=admin_headers,
            json={"is_demo": True},
        )
        assert resp.status_code == 200, resp.text

        resp = await client.patch(
            f"/api/v1/videos/admin/{second.id}",
            headers=admin_headers,
            json={"is_demo": True},
        )
        assert resp.status_code == 200, resp.text

        async with TestSessionLocal() as db:
            from app.models.video import Video

            demo_ids = (await db.execute(select(Video.id).where(Video.is_demo.is_(True)))).scalars().all()
        assert demo_ids == [second.id]
