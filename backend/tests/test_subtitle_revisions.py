"""Tests for Phase 3a-d — subtitle edit audit, history, rollback.

Covers:
- Editing a subtitle writes a ``SubtitleRevision`` (before/after delta).
- ``scope`` is ``fork`` for a non-standard video, ``standard`` for the URL's
  canonical standard body.
- A no-op edit (same value) writes no revision.
- Rollback restores the ``before`` state and itself writes a new revision.
- History endpoints: per-video and per-subtitle, newest first.
"""

from httpx import AsyncClient
from sqlalchemy import select

from app.models.subtitle import Subtitle
from app.models.subtitle_revision import SubtitleRevision
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus


async def _owner_id(db) -> str:
    user = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
    return user.id


async def _make_video_with_subtitle(db, *, owner_id: str, is_standard: bool = False):
    """Create a ready video with one subtitle; optionally register it as the URL standard."""
    v = Video(
        title="Audit Test",
        source_url="https://www.youtube.com/watch?v=audit_test",
        video_source="imported",
        status=VideoStatus.ready,
        is_official=False,
        is_published=False,
        review_status=VideoReviewStatus.draft.value,
        user_id=owner_id,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    sub = Subtitle(
        video_id=v.id,
        start_time=0.0,
        end_time=1.0,
        text_en="hello",
        text_zh="你好",
        sentence_index=0,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    if is_standard:
        from app.models.video_standard import VideoStandard

        db.add(VideoStandard(source_url=v.source_url, canonical_video_id=v.id))
        await db.commit()
    return v, sub


class TestEditWritesRevision:
    """Editing a subtitle writes an audited revision with the right scope."""

    async def test_edit_fork_writes_revision_scope_fork(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v, sub = await _make_video_with_subtitle(db, owner_id=owner, is_standard=False)
            vid, sid = v.id, sub.id

        resp = await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sid}",
            json={"text_en": "hello world"},
            headers=admin_headers,
        )
        assert resp.status_code == 200

        resp = await client.get(f"/api/v1/videos/admin/{vid}/subtitles/revisions", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        rev = data["items"][0]
        assert rev["scope"] == "fork"
        assert rev["subtitle_id"] == sid
        assert rev["before"]["text_en"] == "hello"
        assert rev["after"]["text_en"] == "hello world"
        assert rev["edited_by"] is not None

    async def test_edit_standard_writes_revision_scope_standard(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v, sub = await _make_video_with_subtitle(db, owner_id=owner, is_standard=True)
            vid, sid = v.id, sub.id

        resp = await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sid}",
            json={"text_zh": "哈喽"},
            headers=admin_headers,
        )
        assert resp.status_code == 200

        resp = await client.get(f"/api/v1/videos/admin/{vid}/subtitles/revisions", headers=admin_headers)
        rev = resp.json()["items"][0]
        assert rev["scope"] == "standard"
        assert rev["before"]["text_zh"] == "你好"
        assert rev["after"]["text_zh"] == "哈喽"

    async def test_noop_edit_writes_no_revision(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v, sub = await _make_video_with_subtitle(db, owner_id=owner)
            vid, sid = v.id, sub.id

        # Same value — no-op.
        resp = await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sid}",
            json={"text_en": "hello"},
            headers=admin_headers,
        )
        assert resp.status_code == 200

        resp = await client.get(f"/api/v1/videos/admin/{vid}/subtitles/revisions", headers=admin_headers)
        assert len(resp.json()["items"]) == 0


class TestRollback:
    """Rollback restores the before-state and writes its own audit row."""

    async def test_rollback_restores_before_and_audits(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v, sub = await _make_video_with_subtitle(db, owner_id=owner)
            vid, sid = v.id, sub.id

        # Edit, then capture the revision id.
        await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sid}",
            json={"text_en": "changed"},
            headers=admin_headers,
        )
        resp = await client.get(f"/api/v1/videos/admin/{vid}/subtitles/revisions", headers=admin_headers)
        rev_id = resp.json()["items"][0]["id"]

        # Roll back.
        resp = await client.post(
            f"/api/v1/videos/admin/{vid}/subtitles/{sid}/rollback/{rev_id}",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["text_en"] == "hello"  # restored

        # Two revisions now: the edit + the rollback.
        resp = await client.get(f"/api/v1/videos/admin/{vid}/subtitles/revisions", headers=admin_headers)
        items = resp.json()["items"]
        assert len(items) == 2
        # Newest first → rollback is items[0], its after reflects the restored value.
        assert items[0]["after"]["text_en"] == "hello"
        assert items[0]["before"]["text_en"] == "changed"


class TestHistoryEndpoints:
    """Per-video and per-subtitle revision listings."""

    async def test_per_subtitle_history(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v, sub = await _make_video_with_subtitle(db, owner_id=owner)
            sub2 = Subtitle(
                video_id=v.id,
                start_time=1.0,
                end_time=2.0,
                text_en="world",
                sentence_index=1,
            )
            db.add(sub2)
            await db.commit()
            await db.refresh(sub2)
            vid, sid, sid2 = v.id, sub.id, sub2.id

        # Edit both subtitles.
        await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sid}",
            json={"text_en": "a"},
            headers=admin_headers,
        )
        await client.patch(
            f"/api/v1/videos/admin/{vid}/subtitles/{sid2}",
            json={"text_en": "b"},
            headers=admin_headers,
        )

        # Per-video: both revisions.
        resp = await client.get(f"/api/v1/videos/admin/{vid}/subtitles/revisions", headers=admin_headers)
        assert len(resp.json()["items"]) == 2

        # Per-subtitle: only sid's revision.
        resp = await client.get(f"/api/v1/videos/admin/{vid}/subtitles/{sid}/revisions", headers=admin_headers)
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["subtitle_id"] == sid
