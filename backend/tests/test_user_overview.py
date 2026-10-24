"""Tests for GET /api/v1/users/me/overview (aggregated profile read model)."""

from httpx import AsyncClient


class TestUserOverview:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/v1/users/me/overview")).status_code == 401

    async def test_empty_user_has_zeroed_blocks(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/users/me/overview", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["learning"]["days_studied"] == 0
        assert data["learning"]["total_minutes"] == 0
        assert data["words"]["total"] == 0
        assert data["videos"] == {"started": 0, "completed": 0}
        assert data["library"] == {"favorite_videos": 0, "favorite_sentences": 0, "notes": 0}
        assert data["membership"]["is_pro"] is False
        assert len(data["this_week"]["daily"]) == 7
        assert data["this_week"]["days_active"] == 0

    async def test_counts_records_and_vocabulary(self, client: AsyncClient, auth_headers: dict, db_session):
        from app.models.learning import LearningRecord, Vocabulary
        from app.models.video import Video, VideoSource, VideoStatus

        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        video = Video(
            title="Overview video",
            source_url="https://example.com/overview.mp4",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            duration=300.0,
        )
        db_session.add(video)
        await db_session.flush()
        db_session.add_all(
            [
                LearningRecord(
                    user_id=me["id"],
                    video_id=video.id,
                    completed=True,
                    progress_percentage=100.0,
                    time_spent_seconds=600,
                ),
                Vocabulary(user_id=me["id"], word="overview", mastery_level="mastered"),
            ]
        )
        await db_session.commit()

        data = (await client.get("/api/v1/users/me/overview", headers=auth_headers)).json()
        assert data["learning"]["total_minutes"] == 10
        assert data["videos"] == {"started": 1, "completed": 1}
        assert data["words"]["total"] == 1
        assert data["words"]["mastered_count"] == 1
        assert data["learning"]["days_studied"] >= 1
