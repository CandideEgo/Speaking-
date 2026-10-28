"""Tests for GET /api/v1/learning/continue (resume strip read model)."""

from httpx import AsyncClient

from app.models.learning import LearningRecord
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed_video(*, official: bool = True, published: bool = True) -> str:
    async with TestSessionLocal() as db:
        video = Video(
            title="Continue video",
            source_url="https://example.com/continue.mp4",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=official,
            is_published=published,
            duration=300.0,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)
        return video.id


class TestContinueLearning:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/v1/learning/continue")).status_code == 401

    async def test_empty_for_new_user(self, client: AsyncClient, auth_headers: dict):
        data = (await client.get("/api/v1/learning/continue", headers=auth_headers)).json()
        assert data == {"items": [], "total": 0}

    async def test_returns_only_started_unfinished_public_videos(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        started = await _seed_video()
        finished = await _seed_video()
        untouched = await _seed_video()
        hidden = await _seed_video(published=False)
        async with TestSessionLocal() as db:
            db.add_all(
                [
                    LearningRecord(
                        user_id=me["id"],
                        video_id=started,
                        progress_percentage=40.0,
                        position_seconds=120.0,
                    ),
                    LearningRecord(user_id=me["id"], video_id=finished, completed=True, progress_percentage=100.0),
                    LearningRecord(user_id=me["id"], video_id=untouched, progress_percentage=0.0),
                    LearningRecord(user_id=me["id"], video_id=hidden, progress_percentage=50.0),
                ]
            )
            await db.commit()

        data = (await client.get("/api/v1/learning/continue", headers=auth_headers)).json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["video"]["id"] == started
        assert item["position_seconds"] == 120.0
        assert item["remaining_seconds"] == 180.0

    async def test_limit_is_applied(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            for _ in range(3):
                video = Video(
                    title="v",
                    source_url="https://example.com/v.mp4",
                    video_source=VideoSource.imported,
                    status=VideoStatus.ready,
                    is_official=True,
                    is_published=True,
                )
                db.add(video)
                await db.flush()
                db.add(LearningRecord(user_id=me["id"], video_id=video.id, progress_percentage=10.0))
            await db.commit()

        data = (await client.get("/api/v1/learning/continue?limit=2", headers=auth_headers)).json()
        assert data["total"] == 2
