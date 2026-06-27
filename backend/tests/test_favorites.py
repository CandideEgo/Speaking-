"""Tests for per-video favorites & notes (account-scoped, replaces localStorage)."""

import uuid

from httpx import AsyncClient

from app.models.video import Video, VideoStatus
from tests.conftest import TestSessionLocal


async def _create_video() -> str:
    """Insert a minimal ready video row in the test DB and return its id."""
    async with TestSessionLocal() as db:
        video = Video(
            id=str(uuid.uuid4()),
            title="Test Video",
            source_url="https://example.com/test.mp4",
            status=VideoStatus.ready,
        )
        db.add(video)
        await db.commit()
        return video.id


class TestFavorites:
    async def test_endpoints_require_auth(self, client: AsyncClient):
        vid = await _create_video()
        assert (await client.get(f"/api/v1/videos/{vid}/watch-meta")).status_code == 401
        assert (await client.post(f"/api/v1/videos/{vid}/favorite")).status_code == 401
        assert (await client.delete(f"/api/v1/videos/{vid}/favorite")).status_code == 401

    async def test_favorite_toggle_and_meta(self, client: AsyncClient, auth_headers: dict):
        vid = await _create_video()

        # Initially not favorited, no note
        meta = (await client.get(f"/api/v1/videos/{vid}/watch-meta", headers=auth_headers)).json()
        assert meta == {"is_favorited": False, "note": ""}

        # Add favorite (idempotent)
        assert (await client.post(f"/api/v1/videos/{vid}/favorite", headers=auth_headers)).json() == {
            "is_favorited": True
        }
        assert (await client.post(f"/api/v1/videos/{vid}/favorite", headers=auth_headers)).json() == {
            "is_favorited": True
        }

        meta = (await client.get(f"/api/v1/videos/{vid}/watch-meta", headers=auth_headers)).json()
        assert meta["is_favorited"] is True

        # Remove favorite (idempotent)
        assert (await client.delete(f"/api/v1/videos/{vid}/favorite", headers=auth_headers)).json() == {
            "is_favorited": False
        }
        assert (await client.delete(f"/api/v1/videos/{vid}/favorite", headers=auth_headers)).json() == {
            "is_favorited": False
        }

    async def test_unknown_video_404(self, client: AsyncClient, auth_headers: dict):
        fake = str(uuid.uuid4())
        assert (await client.get(f"/api/v1/videos/{fake}/watch-meta", headers=auth_headers)).status_code == 404


class TestNotes:
    async def test_note_upsert_get_delete(self, client: AsyncClient, auth_headers: dict):
        vid = await _create_video()

        # Empty initially
        assert (await client.get(f"/api/v1/videos/{vid}/note", headers=auth_headers)).json() == {"content": ""}

        # Create
        resp = await client.put(f"/api/v1/videos/{vid}/note", headers=auth_headers, json={"content": "first note"})
        assert resp.json() == {"content": "first note"}

        # Update (upsert)
        resp = await client.put(f"/api/v1/videos/{vid}/note", headers=auth_headers, json={"content": "updated"})
        assert resp.json() == {"content": "updated"}

        # watch-meta reflects the note
        meta = (await client.get(f"/api/v1/videos/{vid}/watch-meta", headers=auth_headers)).json()
        assert meta["note"] == "updated"

        # Delete (idempotent)
        assert (await client.delete(f"/api/v1/videos/{vid}/note", headers=auth_headers)).json() == {"content": ""}
        assert (await client.get(f"/api/v1/videos/{vid}/note", headers=auth_headers)).json() == {"content": ""}
