"""Tests for GET /api/v1/videos/{id}/related."""

from httpx import AsyncClient
from sqlalchemy import select

from app.models.channel import Channel
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed(*, title: str, channel_id: str | None = None, tags: str | None = None) -> str:
    async with TestSessionLocal() as db:
        video = Video(
            title=title,
            source_url=f"https://example.com/{title}.mp4",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            channel_ref=channel_id,
            topic_tags=tags,
            duration=120.0,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)
        return video.id


class TestRelatedVideos:
    async def test_unknown_video_404(self, client: AsyncClient):
        assert (await client.get("/api/v1/videos/nope/related")).status_code == 404

    async def test_same_channel_first_and_self_excluded(self, client: AsyncClient):
        async with TestSessionLocal() as db:
            channel = Channel(name="Related", slug="related-test", is_visible=True)
            db.add(channel)
            await db.commit()
            await db.refresh(channel)
            channel_id = channel.id
        source = await _seed(title="source", channel_id=channel_id, tags="ted")
        same_channel = await _seed(title="same-channel", channel_id=channel_id)
        await _seed(title="other")

        data = (await client.get(f"/api/v1/videos/{source}/related")).json()
        ids = [item["id"] for item in data["items"]]
        assert source not in ids
        assert ids[0] == same_channel
        assert len(ids) == 2

    async def test_topic_tag_fallback(self, client: AsyncClient):
        source = await _seed(title="tag-source", tags="science,space")
        same_tag = await _seed(title="same-tag", tags="science")
        await _seed(title="unrelated", tags="travel")

        data = (await client.get(f"/api/v1/videos/{source}/related?limit=1")).json()
        assert [item["id"] for item in data["items"]] == [same_tag]

    async def test_limit_and_public_filter(self, client: AsyncClient):
        source = await _seed(title="filter-source")
        for i in range(3):
            await _seed(title=f"public-{i}")
        async with TestSessionLocal() as db:
            hidden = (await db.execute(select(Video).limit(1))).scalar_one()
            hidden.is_published = False
            await db.commit()

        data = (await client.get(f"/api/v1/videos/{source}/related?limit=2")).json()
        assert len(data["items"]) == 2
        assert data["total"] == 2
