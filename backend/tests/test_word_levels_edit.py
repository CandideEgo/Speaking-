"""Tests for admin word_levels edit + recompute endpoints."""

from httpx import AsyncClient

from app.models.subtitle import Subtitle
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed() -> tuple[str, list[str]]:
    async with TestSessionLocal() as db:
        v = Video(
            title="Word Levels Test",
            source_url="https://youtu.be/wltest",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
        )
        db.add(v)
        await db.flush()
        subs = [
            Subtitle(video_id=v.id, start_time=0.0, end_time=2.0, text_en="running fast", sentence_index=0),
            Subtitle(video_id=v.id, start_time=2.0, end_time=4.0, text_en="hello world", sentence_index=1),
        ]
        for s in subs:
            db.add(s)
        await db.commit()
        return v.id, [s.id for s in subs]


class TestWordLevelsUpdate:
    async def test_manual_override(self, client: AsyncClient, admin_headers: dict):
        vid, sids = await _seed()
        resp = await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/word-levels",
            headers=admin_headers,
            json={"word_levels": {"running": ["cet4", "cet6"], "fast": ["gaoKao"]}},
        )
        assert resp.status_code == 200
        levels = resp.json()["word_levels"]
        assert levels == {"running": ["cet4", "cet6"], "fast": ["gaoKao"]}

    async def test_clear_with_null(self, client: AsyncClient, admin_headers: dict):
        vid, sids = await _seed()
        # Set first, then clear.
        await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/word-levels",
            headers=admin_headers,
            json={"word_levels": {"running": ["cet4"]}},
        )
        resp = await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/word-levels",
            headers=admin_headers,
            json={"word_levels": None},
        )
        assert resp.status_code == 200
        assert resp.json()["word_levels"] is None

    async def test_invalid_level_key_rejected(self, client: AsyncClient, admin_headers: dict):
        vid, sids = await _seed()
        resp = await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/word-levels",
            headers=admin_headers,
            json={"word_levels": {"running": ["not_a_real_level"]}},
        )
        assert resp.status_code == 422

    async def test_requires_admin(self, client: AsyncClient, auth_headers: dict):
        vid, sids = await _seed()
        resp = await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/word-levels",
            headers=auth_headers,
            json={"word_levels": {}},
        )
        assert resp.status_code == 403

    async def test_cross_video_400(self, client: AsyncClient, admin_headers: dict):
        _, sids_a = await _seed()
        vid_b, _ = await _seed()
        resp = await client.patch(
            f"/api/v1/videos/admin/{vid_b}/subtitles/{sids_a[0]}/word-levels",
            headers=admin_headers,
            json={"word_levels": {"x": ["cet4"]}},
        )
        assert resp.status_code == 400


class TestWordLevelsRecompute:
    async def test_recompute_whole_video(self, client: AsyncClient, admin_headers: dict):
        vid, _ = await _seed()
        resp = await client.post(
            f"/api/v1/videos/admin/{vid}/subtitles/word-levels/recompute",
            headers=admin_headers,
            json={},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "subtitles_updated" in data
        assert "exam_words_found" in data
        # Two subtitles in the seed.
        assert data["subtitles_updated"] == 2

    async def test_recompute_selected_ids(self, client: AsyncClient, admin_headers: dict):
        vid, sids = await _seed()
        resp = await client.post(
            f"/api/v1/videos/admin/{vid}/subtitles/word-levels/recompute",
            headers=admin_headers,
            json={"subtitle_ids": [sids[0]]},
        )
        assert resp.status_code == 200
        assert resp.json()["subtitles_updated"] == 1

    async def test_recompute_empty_ids_updates_none(self, client: AsyncClient, admin_headers: dict):
        vid, _ = await _seed()
        resp = await client.post(
            f"/api/v1/videos/admin/{vid}/subtitles/word-levels/recompute",
            headers=admin_headers,
            json={"subtitle_ids": []},
        )
        assert resp.status_code == 200
        assert resp.json()["subtitles_updated"] == 0

    async def test_recompute_no_body_defaults_to_all(self, client: AsyncClient, admin_headers: dict):
        vid, _ = await _seed()
        resp = await client.post(
            f"/api/v1/videos/admin/{vid}/subtitles/word-levels/recompute",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["subtitles_updated"] == 2
