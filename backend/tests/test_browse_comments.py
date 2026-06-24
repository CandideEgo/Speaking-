"""Tests for the browse channel API (/api/v1/browse) and comments API (/api/v1/comments)."""

from httpx import AsyncClient

from app.models.comment import VideoComment
from app.models.user import PlanType, RoleType, User
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal, hash_password


async def _seed_official_video(
    title: str = "Official Video",
    topic_tags: str | None = None,
    difficulty: str | None = None,
    comment_quality_score: float | None = None,
) -> str:
    async with TestSessionLocal() as db:
        v = Video(
            title=title,
            source_url=f"https://youtu.be/{title}",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            topic_tags=topic_tags,
            difficulty_level=difficulty,
            comment_quality_score=comment_quality_score,
        )
        db.add(v)
        await db.commit()
        await db.refresh(v)
        return v.id


class TestBrowseCategories:
    async def test_list_categories(self, client: AsyncClient):
        resp = await client.get("/api/v1/browse/categories")
        assert resp.status_code == 200
        cats = resp.json()["categories"]
        ids = [c["id"] for c in cats]
        assert "all" in ids
        assert "ted" in ids


class TestBrowseFeed:
    async def test_feed_returns_official_videos(self, client: AsyncClient):
        await _seed_official_video("Talk One")
        await _seed_official_video("Talk Two")
        resp = await client.get("/api/v1/browse/feed")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 2
        titles = [i["title"] for i in data["items"]]
        assert "Talk One" in titles

    async def test_feed_excludes_non_official(self, client: AsyncClient):
        await _seed_official_video("Official")
        async with TestSessionLocal() as db:
            db.add(
                Video(
                    title="User Video",
                    source_url="https://youtu.be/user1",
                    video_source=VideoSource.imported,
                    status=VideoStatus.ready,
                    is_official=False,
                )
            )
            await db.commit()
        resp = await client.get("/api/v1/browse/feed")
        titles = [i["title"] for i in resp.json()["items"]]
        assert "Official" in titles
        assert "User Video" not in titles

    async def test_feed_pagination(self, client: AsyncClient):
        for i in range(6):
            await _seed_official_video(f"Pag Vid {i}")
        # page_size minimum is 4 (see browse.py Query constraint)
        resp = await client.get("/api/v1/browse/feed?page=1&page_size=4")
        data = resp.json()
        assert len(data["items"]) == 4
        assert data["has_more"] is True


class TestBrowseFeatured:
    async def test_featured_returns_videos(self, client: AsyncClient):
        await _seed_official_video("Featured 1")
        resp = await client.get("/api/v1/browse/featured?limit=6")
        assert resp.status_code == 200
        assert "items" in resp.json()
        assert len(resp.json()["items"]) >= 1


class TestCommentsRoutes:
    async def test_get_comments_empty(self, client: AsyncClient, auth_headers: dict):
        # Create an official video owned by no one (public access)
        vid = await _seed_official_video()
        resp = await client.get(f"/api/v1/comments/{vid}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_get_comments_returns_items(self, client: AsyncClient, auth_headers: dict):
        vid = await _seed_official_video()
        async with TestSessionLocal() as db:
            db.add(VideoComment(video_id=vid, external_id="yt-1", author_name="Alice", text="Great!", like_count=10))
            db.add(VideoComment(video_id=vid, external_id="yt-2", author_name="Bob", text="Nice", like_count=5))
            await db.commit()
        resp = await client.get(f"/api/v1/comments/{vid}")
        items = resp.json()["items"]
        assert len(items) == 2
        # ordered by like_count desc
        assert items[0]["like_count"] >= items[1]["like_count"]

    async def test_get_comments_nonexistent_video_404(self, client: AsyncClient):
        # No video exists → require_video_access raises 404
        resp = await client.get("/api/v1/comments/nonexistent-vid")
        assert resp.status_code == 404

    async def test_comment_stats_not_analyzed(self, client: AsyncClient, auth_headers: dict):
        vid = await _seed_official_video()
        resp = await client.get(f"/api/v1/comments/{vid}/stats")
        assert resp.status_code == 200
        assert resp.json()["analyzed"] is False

    async def test_analyze_requires_admin(self, client: AsyncClient, auth_headers: dict):
        vid = await _seed_official_video()
        resp = await client.post(f"/api/v1/comments/analyze?video_id={vid}", headers=auth_headers)
        assert resp.status_code == 403

    async def test_top_videos_by_comment_quality(self, client: AsyncClient):
        await _seed_official_video("High Quality", comment_quality_score=0.9)
        await _seed_official_video("Low Quality", comment_quality_score=0.3)
        resp = await client.get("/api/v1/comments/top-videos")
        assert resp.status_code == 200
        items = resp.json()["items"]
        # ordered by score desc
        assert items[0]["comment_quality_score"] >= items[-1]["comment_quality_score"]
