"""Tests for the UGC video review lifecycle (Phase 2A).

Covers: owner subtitle editing + review-state guards, begin-edit snapshot
freezing, submit/withdraw, admin approve/reject, and the public snapshot
serving during re-review.
"""

from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy import select

from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus


async def _owner_id(db) -> str:
    """Look up the regular test user (created by the auth_headers fixture)."""
    user = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
    return user.id


async def _seed_own_video(db, *, owner_id, review_status=VideoReviewStatus.draft, status=VideoStatus.ready):
    v = Video(
        title="UGC Test",
        source_url="https://example.com/ugc.mp4",
        video_source="local",
        status=status,
        is_official=False,
        is_published=False,
        review_status=review_status.value,
        user_id=owner_id,
        video_url_720p="/media/ugc.mp4",
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


async def _add_subtitle(db, video_id, text_en="hello world", idx=0):
    s = Subtitle(video_id=video_id, start_time=0.0, end_time=1.0, text_en=text_en, sentence_index=idx)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


class TestOwnerSubtitleEdit:
    async def test_owner_can_edit_draft_subtitle(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner)
            s = await _add_subtitle(db, v.id)
            vid, sid = v.id, s.id

        resp = await client.patch(
            f"/api/v1/videos/{vid}/subtitles/{sid}",
            headers=auth_headers,
            json={"text_en": "edited text"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["text_en"] == "edited text"

    async def test_non_owner_cannot_edit(self, client: AsyncClient, auth_headers: dict):
        """A second user must not edit another user's video (404, no existence leak)."""
        from tests.conftest import TestSessionLocal

        # Create the owner's video.
        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner)
            s = await _add_subtitle(db, v.id)
            vid, sid = v.id, s.id

        # Register a *different* user and act with their token.
        other_headers = await _make_other_user_headers()

        resp = await client.patch(
            f"/api/v1/videos/{vid}/subtitles/{sid}",
            headers=other_headers,
            json={"text_en": "hijack"},
        )
        assert resp.status_code == 404

    async def test_edit_blocked_when_published(self, client: AsyncClient, auth_headers: dict):
        """A published video cannot be edited directly — owner must begin-edit first."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner, review_status=VideoReviewStatus.published)
            s = await _add_subtitle(db, v.id)
            vid, sid = v.id, s.id

        resp = await client.patch(
            f"/api/v1/videos/{vid}/subtitles/{sid}",
            headers=auth_headers,
            json={"text_en": "should fail"},
        )
        assert resp.status_code == 409

    async def test_preserve_word_levels_keeps_overrides(self, client: AsyncClient, auth_headers: dict):
        """preserve_word_levels=True stops the ECDICT reset on text_en edit."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner)
            s = await _add_subtitle(db, v.id, text_en="good morning")
            s.word_levels = {"good": ["cet4"], "morning": ["cet4"]}  # manual override
            await db.commit()
            await db.refresh(s)
            vid, sid = v.id, s.id

        # Edit text_en with preserve_word_levels=True → overrides retained.
        resp = await client.patch(
            f"/api/v1/videos/{vid}/subtitles/{sid}",
            headers=auth_headers,
            json={"text_en": "good evening", "preserve_word_levels": True},
        )
        assert resp.status_code == 200, resp.text
        levels = resp.json()["word_levels"]
        assert levels is not None and "good" in levels


async def _make_other_user_headers() -> dict:
    """Create a second user distinct from the auth_headers fixture user."""
    from app.core.security import create_token, hash_password
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        from app.models.user import PlanType, RoleType, User

        user = User(
            email="other@example.com",
            hashed_password=hash_password("Otherpass1!"),
            name="Other",
            plan=PlanType.free,
            role=RoleType.user,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return {"Authorization": f"Bearer {create_token(user.id)}"}


class TestReviewLifecycle:
    async def test_submit_requires_ready_and_subtitles(self, client: AsyncClient, auth_headers: dict):
        """A processing video with no subtitles cannot be submitted."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner, status=VideoStatus.processing)
            vid = v.id

        resp = await client.post(f"/api/v1/videos/{vid}/submit-review", headers=auth_headers)
        assert resp.status_code == 400

    async def test_submit_then_withdraw(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner)
            await _add_subtitle(db, v.id)
            vid = v.id

        resp = await client.post(f"/api/v1/videos/{vid}/submit-review", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["review_status"] == "pending_review"

        resp = await client.post(f"/api/v1/videos/{vid}/withdraw", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["review_status"] == "draft"

    async def test_admin_approve_publishes_and_snapshots(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner)
            await _add_subtitle(db, v.id, text_en="approved line")
            vid = v.id

        await client.post(f"/api/v1/videos/{vid}/submit-review", headers=auth_headers)

        resp = await client.post(f"/api/v1/videos/admin/{vid}/review/approve", headers=admin_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["review_status"] == "published"
        assert data["is_published"] is True

        # Snapshot was frozen.
        async with TestSessionLocal() as db:
            v2 = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert v2.published_snapshot is not None
            assert v2.published_snapshot["subtitles"][0]["text_en"] == "approved line"

    async def test_admin_reject_keeps_reason(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner)
            await _add_subtitle(db, v.id)
            vid = v.id

        await client.post(f"/api/v1/videos/{vid}/submit-review", headers=auth_headers)

        resp = await client.post(
            f"/api/v1/videos/admin/{vid}/review/reject",
            headers=admin_headers,
            json={"reason": "字幕翻译质量不达标"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["review_status"] == "rejected"
        assert data["rejection_reason"] == "字幕翻译质量不达标"

    async def test_reject_requires_reason(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner)
            await _add_subtitle(db, v.id)
            vid = v.id

        await client.post(f"/api/v1/videos/{vid}/submit-review", headers=auth_headers)

        resp = await client.post(
            f"/api/v1/videos/admin/{vid}/review/reject",
            headers=admin_headers,
            json={"reason": "   "},
        )
        assert resp.status_code == 422


class TestSnapshotServing:
    async def test_public_sees_snapshot_during_rereview(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        """After begin-edit, the public keeps watching the approved snapshot while
        the owner edits the live draft."""
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner, review_status=VideoReviewStatus.published)
            s = await _add_subtitle(db, v.id, text_en="approved public line")
            # Simulate a prior approval: snapshot the approved line.
            v.published_snapshot = {
                "version": 1,
                "subtitles": [
                    {
                        "id": s.id,
                        "start_time": 0.0,
                        "end_time": 1.0,
                        "text_en": "approved public line",
                        "text_zh": None,
                        "sentence_index": 0,
                        "grammar_note": None,
                        "speaker": None,
                        "word_levels": None,
                    }
                ],
            }
            await db.commit()
            vid = v.id

        # Owner begins editing → flips to pending_review.
        resp = await client.post(f"/api/v1/videos/{vid}/begin-edit", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["review_status"] == "pending_review"

        # Owner edits the live draft to something new (allowed in pending_review).
        async with TestSessionLocal() as db:
            sub = (await db.execute(select(Subtitle).where(Subtitle.video_id == vid))).scalar_one()
            sid = sub.id
        await client.patch(
            f"/api/v1/videos/{vid}/subtitles/{sid}",
            headers=auth_headers,
            json={"text_en": "owner draft edit"},
        )

        # An anonymous (public) viewer fetches detail and sees the SNAPSHOT
        # (approved public line), not the owner's in-progress draft.
        resp = await client.get(f"/api/v1/videos/{vid}")
        assert resp.status_code == 200, resp.text
        subs = resp.json()["subtitles"]
        assert subs[0]["text_en"] == "approved public line"

    async def test_owner_sees_live_draft_during_rereview(self, client: AsyncClient, auth_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            v = await _seed_own_video(db, owner_id=owner, review_status=VideoReviewStatus.published)
            s = await _add_subtitle(db, v.id, text_en="approved public line")
            v.published_snapshot = {
                "version": 1,
                "subtitles": [
                    {
                        "id": s.id,
                        "start_time": 0.0,
                        "end_time": 1.0,
                        "text_en": "approved public line",
                        "text_zh": None,
                        "sentence_index": 0,
                        "grammar_note": None,
                        "speaker": None,
                        "word_levels": None,
                    }
                ],
            }
            await db.commit()
            vid = v.id

        await client.post(f"/api/v1/videos/{vid}/begin-edit", headers=auth_headers)
        async with TestSessionLocal() as db:
            sub = (await db.execute(select(Subtitle).where(Subtitle.video_id == vid))).scalar_one()
            sid = sub.id
        await client.patch(
            f"/api/v1/videos/{vid}/subtitles/{sid}", headers=auth_headers, json={"text_en": "owner draft edit"}
        )

        # The OWNER sees the live draft, not the snapshot.
        resp = await client.get(f"/api/v1/videos/{vid}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["subtitles"][0]["text_en"] == "owner draft edit"


class TestAdminReviewFilter:
    async def test_review_status_filter(self, client: AsyncClient, auth_headers: dict, admin_headers: dict):
        from tests.conftest import TestSessionLocal

        async with TestSessionLocal() as db:
            owner = await _owner_id(db)
            await _seed_own_video(
                db, owner_id=owner, review_status=VideoReviewStatus.pending_review, status=VideoStatus.ready
            )
            await _seed_own_video(db, owner_id=owner, review_status=VideoReviewStatus.draft, status=VideoStatus.ready)

        resp = await client.get("/api/v1/videos/admin?review_status=pending_review", headers=admin_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items, "expected at least one pending_review video"
        assert all(i["review_status"] == "pending_review" for i in items)
