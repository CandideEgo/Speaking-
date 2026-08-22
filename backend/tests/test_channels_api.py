"""Tests for the Channels API (ADR-0014)."""

from app.models.channel import Channel
from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus


async def _make_video(db, *, official=True, published=True, ready=True, channel_id=None, channel_ref=None) -> Video:
    video = Video(
        title="Channel Test Video",
        source_url="https://example.com/channel-test.mp4",
        video_source=VideoSource.imported,
        status=VideoStatus.ready if ready else VideoStatus.processing,
        review_status=VideoReviewStatus.published.value,
        is_official=official,
        is_published=published,
        channel_id=channel_id,
        channel_ref=channel_ref,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


async def _make_channel(db, **kw) -> Channel:
    defaults = dict(name="TED Talks", slug="ted-talks", sort_order=0, is_visible=True)
    defaults.update(kw)
    channel = Channel(**defaults)
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return channel


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


async def test_list_channels_shows_visible_only_with_counts(client, db_session):
    visible = await _make_channel(db_session, slug="visible-one", sort_order=1)
    await _make_channel(db_session, name="Hidden", slug="hidden-one", is_visible=False)
    await _make_video(db_session, channel_ref=visible.id)
    # Draft/unpublished videos must not count.
    await _make_video(db_session, channel_ref=visible.id, published=False)

    resp = await client.get("/api/v1/channels")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [c["slug"] for c in items] == ["visible-one"]
    assert items[0]["video_count"] == 1


async def test_channel_detail_lists_published_videos(client, db_session):
    channel = await _make_channel(db_session, description="Curated talks")
    await _make_video(db_session, channel_ref=channel.id)
    await _make_video(db_session, channel_ref=channel.id, ready=False)  # not ready → excluded

    resp = await client.get(f"/api/v1/channels/{channel.slug}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["channel"]["slug"] == channel.slug
    assert data["channel"]["description"] == "Curated talks"
    assert data["videos"]["total"] == 1
    assert len(data["videos"]["items"]) == 1


async def test_channel_detail_unknown_slug_404(client):
    resp = await client.get("/api/v1/channels/does-not-exist")
    assert resp.status_code == 404


async def test_hidden_channel_detail_404(client, db_session):
    await _make_channel(db_session, slug="secret", is_visible=False)
    resp = await client.get("/api/v1/channels/secret")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


async def test_admin_create_channel_and_auto_attach_by_upstream_id(client, admin_headers, db_session):
    # Existing video scraped from an upstream channel, not yet curated.
    video = await _make_video(db_session, channel_id="UC12345")

    resp = await client.post(
        "/api/v1/channels/admin",
        json={"name": "TED", "slug": "ted", "upstream_channel_id": "UC12345"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    channel_id = resp.json()["id"]

    # Video auto-attached via upstream_channel_id match.
    await db_session.refresh(video)
    assert video.channel_ref == channel_id


async def test_admin_create_channel_slug_conflict_400(client, admin_headers, db_session):
    await _make_channel(db_session, slug="taken")
    resp = await client.post("/api/v1/channels/admin", json={"name": "Other", "slug": "taken"}, headers=admin_headers)
    assert resp.status_code == 400


async def test_admin_create_channel_invalid_slug_400(client, admin_headers):
    resp = await client.post(
        "/api/v1/channels/admin", json={"name": "Bad", "slug": "Not A Slug!"}, headers=admin_headers
    )
    assert resp.status_code == 400


async def test_admin_requires_admin_role(client, auth_headers):
    resp = await client.post("/api/v1/channels/admin", json={"name": "X"}, headers=auth_headers)
    assert resp.status_code == 403


async def test_admin_update_and_delete_channel(client, admin_headers, db_session):
    channel = await _make_channel(db_session)
    resp = await client.patch(
        f"/api/v1/channels/admin/{channel.id}",
        json={"name": "TED Talks 精选", "sort_order": 5, "is_visible": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "TED Talks 精选"
    await db_session.refresh(channel)
    assert channel.sort_order == 5
    assert channel.is_visible is False

    resp = await client.delete(f"/api/v1/channels/admin/{channel.id}", headers=admin_headers)
    assert resp.status_code == 204
    resp = await client.delete(f"/api/v1/channels/admin/{channel.id}", headers=admin_headers)
    assert resp.status_code == 404


async def test_admin_attach_videos_overwrites_assignment(client, admin_headers, db_session):
    a = await _make_channel(db_session, slug="chan-a")
    b = await _make_channel(db_session, slug="chan-b")
    video = await _make_video(db_session, channel_ref=a.id)

    resp = await client.post(
        f"/api/v1/channels/admin/{b.id}/videos",
        json={"video_ids": [video.id]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["attached"] == 1
    await db_session.refresh(video)
    assert video.channel_ref == b.id


async def test_admin_video_patch_sets_channel_ref(client, admin_headers, db_session):
    channel = await _make_channel(db_session)
    video = await _make_video(db_session)

    resp = await client.patch(
        f"/api/v1/videos/admin/{video.id}",
        json={"channel_ref": channel.id},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["channel_ref"] == channel.id

    # Empty string clears the assignment.
    resp = await client.patch(
        f"/api/v1/videos/admin/{video.id}",
        json={"channel_ref": ""},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["channel_ref"] is None
