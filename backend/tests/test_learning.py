"""Tests for the learning records API (/api/v1/learning)."""

from datetime import UTC, datetime

from httpx import AsyncClient

from app.models.learning import LearningRecord
from app.models.user import User
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed_video(owner_id: str | None = None, official: bool = True) -> str:
    async with TestSessionLocal() as db:
        video = Video(
            user_id=owner_id,
            title="Test Talk",
            source_url="https://www.youtube.com/watch?v=learning1",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=official,
            duration=120.0,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)
        return video.id


class TestListLearningRecords:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/v1/learning/records")).status_code == 401

    async def test_empty_for_new_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/learning/records", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["records"] == []
        assert data["total"] == 0

    async def test_returns_records_with_video_info(self, client: AsyncClient, auth_headers: dict):
        # Determine the current user id from /users/me
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        video_id = await _seed_video()

        async with TestSessionLocal() as db:
            db.add(
                LearningRecord(
                    user_id=me["id"],
                    video_id=video_id,
                    speaking_attempts=3,
                    words_learned=5,
                    quiz_score=80.0,
                    completed=True,
                    progress_percentage=100.0,
                )
            )
            await db.commit()

        resp = await client.get("/api/v1/learning/records", headers=auth_headers)
        assert resp.status_code == 200
        records = resp.json()["records"]
        assert len(records) == 1
        rec = records[0]
        assert rec["video_id"] == video_id
        assert rec["speaking_attempts"] == 3
        assert rec["completed"] is True
        assert rec["video"]["title"] == "Test Talk"

    async def test_filter_by_completed(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        vid = await _seed_video()

        async with TestSessionLocal() as db:
            db.add(LearningRecord(user_id=me["id"], video_id=vid, completed=True))
            await db.commit()

        # completed=True → 1 record
        resp = await client.get("/api/v1/learning/records?completed=true", headers=auth_headers)
        assert resp.json()["total"] == 1
        # completed=false → 0 records
        resp = await client.get("/api/v1/learning/records?completed=false", headers=auth_headers)
        assert resp.json()["total"] == 0


class TestSaveAndGetProgress:
    async def test_save_progress_creates_record(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()
        resp = await client.patch(
            "/api/v1/learning/progress",
            headers=auth_headers,
            json={"video_id": video_id, "position_seconds": 60.0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["position_seconds"] == 60.0
        # duration is 120s → 60/120 = 50%
        assert data["progress_percentage"] == 50.0

    async def test_save_progress_updates_existing(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()
        await client.patch(
            "/api/v1/learning/progress",
            headers=auth_headers,
            json={"video_id": video_id, "position_seconds": 10.0},
        )
        resp = await client.patch(
            "/api/v1/learning/progress",
            headers=auth_headers,
            json={"video_id": video_id, "position_seconds": 100.0},
        )
        assert resp.status_code == 200
        assert resp.json()["position_seconds"] == 100.0

    async def test_get_progress_returns_position(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()
        await client.patch(
            "/api/v1/learning/progress",
            headers=auth_headers,
            json={"video_id": video_id, "position_seconds": 30.0},
        )
        resp = await client.get(f"/api/v1/learning/progress/{video_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["video_id"] == video_id
        assert data["position_seconds"] == 30.0

    async def test_get_progress_none_when_never_watched(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()
        resp = await client.get(f"/api/v1/learning/progress/{video_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["position_seconds"] is None


class TestGetLearningRecord:
    async def test_get_existing_record(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        vid = await _seed_video()

        async with TestSessionLocal() as db:
            rec = LearningRecord(user_id=me["id"], video_id=vid, speaking_attempts=2, completed=False)
            db.add(rec)
            await db.commit()
            await db.refresh(rec)
            record_id = rec.id

        resp = await client.get(f"/api/v1/learning/records/{record_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["speaking_attempts"] == 2

    async def test_get_nonexistent_returns_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/learning/records/nonexistent-id", headers=auth_headers)
        assert resp.status_code == 404
