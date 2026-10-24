"""Tests for GET /api/v1/notes (cross-video note library)."""

from httpx import AsyncClient

from app.models.favorite import UserNote
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed_video(title: str = "Note video") -> str:
    async with TestSessionLocal() as db:
        video = Video(
            title=title,
            source_url=f"https://example.com/{title}.mp4",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            duration=120.0,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)
        return video.id


class TestNotesApi:
    async def test_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/v1/notes")).status_code == 401

    async def test_empty_for_new_user(self, client: AsyncClient, auth_headers: dict):
        data = (await client.get("/api/v1/notes", headers=auth_headers)).json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_lists_notes_with_video_info(self, client: AsyncClient, auth_headers: dict):
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        video_id = await _seed_video("My note source")
        async with TestSessionLocal() as db:
            db.add(UserNote(user_id=me["id"], video_id=video_id, content="值得记的表达"))
            await db.commit()

        data = (await client.get("/api/v1/notes", headers=auth_headers)).json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["video_id"] == video_id
        assert item["title"] == "My note source"
        assert item["content"] == "值得记的表达"
        assert item["available"] is True

    async def test_other_users_notes_are_not_visible(self, client: AsyncClient, auth_headers: dict, db_session):
        from app.models.user import User

        other = User(phone="13900139000", hashed_password="x")
        db_session.add(other)
        await db_session.flush()
        video_id = await _seed_video("Other note")
        db_session.add(UserNote(user_id=other.id, video_id=video_id, content="not mine"))
        await db_session.commit()

        data = (await client.get("/api/v1/notes", headers=auth_headers)).json()
        assert data["total"] == 0
