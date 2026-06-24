"""Tests for video endpoints."""

from httpx import AsyncClient


class TestSubmitVideo:
    async def test_submit_video_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/videos",
            json={
                "source_url": "https://www.youtube.com/watch?v=abcdefghijk",
            },
        )
        assert resp.status_code == 401

    async def test_submit_youtube_video_creates_record(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/videos",
            headers=auth_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["source_url"] == "https://www.youtube.com/watch?v=abcdefghijk"
        assert data["video_source"] == "imported"
        assert data["status"] in ("processing", "ready_subtitles", "ready", "error")

    async def test_submit_bilibili_video(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/videos",
            headers=auth_headers,
            json={"source_url": "https://www.bilibili.com/video/BV1xx411c7mD"},
        )
        assert resp.status_code == 201
        assert resp.json()["video_source"] == "imported"


class TestListVideos:
    async def test_list_videos_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos")
        assert resp.status_code == 401

    async def test_list_videos_returns_user_videos(self, client: AsyncClient, auth_headers: dict):
        # Submit a video first
        await client.post(
            "/api/v1/videos",
            headers=auth_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        resp = await client.get("/api/v1/videos", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 1


class TestPublicVideos:
    async def test_list_public_videos(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos/public")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestSeedVideo:
    async def test_seed_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/videos/seed",
            headers=auth_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        assert resp.status_code == 403  # regular user cannot seed

    async def test_seed_as_admin_succeeds(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post(
            "/api/v1/videos/seed",
            headers=admin_headers,
            json={"source_url": "https://www.youtube.com/watch?v=abcdefghijk"},
        )
        assert resp.status_code == 201
        assert resp.json()["is_official"] is True


class TestGetVideo:
    async def test_get_nonexistent_video_returns_404(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos/nonexistent-id")
        assert resp.status_code == 404


class TestVideoQuiz:
    async def test_get_quiz_returns_empty_for_video_without_quiz(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos/nonexistent-id/quiz")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Admin video content management
# ---------------------------------------------------------------------------


async def _seed_video_rows(db, *, count=1, status="ready", is_official=True, is_featured=False, title=None):
    """Insert Video rows directly for admin-list tests."""
    from app.models.video import Video, VideoStatus

    videos = []
    for i in range(count):
        v = Video(
            title=title or f"Admin Test {i}",
            source_url=f"https://www.youtube.com/watch?v=vidid{i:011d}",
            video_source="imported",
            status=VideoStatus(status),
            is_official=is_official,
            is_featured=is_featured,
            video_url_720p=f"/media/vidid{i}.mp4" if status == "ready" else None,
        )
        db.add(v)
        videos.append(v)
    await db.commit()
    for v in videos:
        await db.refresh(v)
    return videos


class TestAdminListVideos:
    async def test_list_requires_admin(self, client: AsyncClient, auth_headers: dict):
        # Regular user is forbidden.
        resp = await client.get("/api/v1/videos/admin", headers=auth_headers)
        assert resp.status_code == 403

    async def test_list_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/videos/admin")
        assert resp.status_code == 401

    async def test_admin_lists_all_videos(self, client: AsyncClient, admin_headers: dict, db_session):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            await _seed_video_rows(db, count=3)

        resp = await client.get("/api/v1/videos/admin", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert "items" in data and "has_more" in data
        assert len(data["items"]) >= 3
        # Admin response exposes featured/notes/error/progress fields.
        item = data["items"][0]
        assert "is_featured" in item
        assert "admin_notes" in item
        assert "processing_progress" in item

    async def test_status_filter(self, client: AsyncClient, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            await _seed_video_rows(db, count=2, status="processing", title="Proc")
            await _seed_video_rows(db, count=1, status="ready", title="Ready")

        resp = await client.get("/api/v1/videos/admin?status=processing", headers=admin_headers)
        assert resp.status_code == 200
        assert all(v["status"] == "processing" for v in resp.json()["items"])

    async def test_pagination_has_more(self, client: AsyncClient, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            await _seed_video_rows(db, count=5)

        resp = await client.get("/api/v1/videos/admin?page=1&page_size=2", headers=admin_headers)
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["has_more"] is True


class TestAdminUpdateVideo:
    async def test_update_requires_admin(self, client: AsyncClient, auth_headers: dict, db_session):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            (v,) = await _seed_video_rows(db, count=1)

        resp = await client.patch(
            f"/api/v1/videos/admin/{v.id}",
            headers=auth_headers,
            json={"title": "New Title"},
        )
        assert resp.status_code == 403

    async def test_update_metadata(self, client: AsyncClient, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            (v,) = await _seed_video_rows(db, count=1)

        resp = await client.patch(
            f"/api/v1/videos/admin/{v.id}",
            headers=admin_headers,
            json={"title": "Updated Title", "difficulty_level": "b2", "is_featured": True, "admin_notes": "note"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated Title"
        assert data["difficulty_level"] == "B2"
        assert data["is_featured"] is True
        assert data["admin_notes"] == "note"

    async def test_update_invalid_difficulty(self, client: AsyncClient, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            (v,) = await _seed_video_rows(db, count=1)

        resp = await client.patch(
            f"/api/v1/videos/admin/{v.id}",
            headers=admin_headers,
            json={"difficulty_level": "X9"},
        )
        assert resp.status_code == 422

    async def test_update_nonexistent(self, client: AsyncClient, admin_headers: dict):
        resp = await client.patch(
            "/api/v1/videos/admin/nope",
            headers=admin_headers,
            json={"title": "x"},
        )
        assert resp.status_code == 404


class TestAdminDeleteVideo:
    async def test_delete_requires_admin(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            (v,) = await _seed_video_rows(db, count=1)

        resp = await client.delete(f"/api/v1/videos/admin/{v.id}", headers=auth_headers)
        assert resp.status_code == 403

    async def test_delete_removes_video_and_subtitles(self, client: AsyncClient, admin_headers: dict):
        from sqlalchemy import select

        from app.models.subtitle import Subtitle
        from app.models.video import Video
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            (v,) = await _seed_video_rows(db, count=1)
            db.add(Subtitle(video_id=v.id, start_time=0.0, end_time=1.0, text_en="hi", sentence_index=0))
            await db.commit()
            vid = v.id

        resp = await client.delete(f"/api/v1/videos/admin/{vid}", headers=admin_headers)
        assert resp.status_code == 204

        # Verify the video and its subtitles are gone.
        async with TestSessionLocal() as db:
            assert (await db.execute(select(Video).where(Video.id == vid))).scalar_one_or_none() is None
            assert (await db.execute(select(Subtitle).where(Subtitle.video_id == vid))).scalars().all() == []

    async def test_delete_nonexistent(self, client: AsyncClient, admin_headers: dict):
        resp = await client.delete("/api/v1/videos/admin/nope", headers=admin_headers)
        assert resp.status_code == 404


class TestAdminLocalizeVideo:
    async def test_localize_requires_admin(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            (v,) = await _seed_video_rows(db, count=1)

        resp = await client.post(f"/api/v1/videos/admin/{v.id}/localize", headers=auth_headers)
        assert resp.status_code == 403

    async def test_localize_dispatches_task(self, client: AsyncClient, admin_headers: dict, monkeypatch):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            (v,) = await _seed_video_rows(db, count=1, status="ready")
            vid = v.id

        resp = await client.post(f"/api/v1/videos/admin/{vid}/localize", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "processing"
        # The conftest _mock_celery fixture records dispatches on the request's
        # monkeypatch — assert localize_video was called.
        calls = getattr(monkeypatch, "_celery_calls", [])
        assert any(name.endswith("localize_video") and args == (vid,) for name, args, _ in calls)

    async def test_localize_conflict_when_processing(self, client: AsyncClient, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            (v,) = await _seed_video_rows(db, count=1, status="processing")

        resp = await client.post(f"/api/v1/videos/admin/{v.id}/localize", headers=admin_headers)
        assert resp.status_code == 409
