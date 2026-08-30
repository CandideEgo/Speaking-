"""Tests for the Shadowing API endpoints (/api/v1/shadowing/*)."""

import io

from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_token, hash_password
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.shadowing import ShadowingAttempt
from app.models.subtitle import Subtitle
from app.models.user import PlanType, RoleType, User
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed_video() -> str:
    async with TestSessionLocal() as db:
        video = Video(
            title="Shadow API Test",
            source_url="https://www.youtube.com/watch?v=shadowapi1",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
            duration=90.0,
        )
        db.add(video)
        await db.commit()
        await db.refresh(video)
        return video.id


async def _seed_subtitle(video_id: str, start_time: float = 12.5) -> str:
    async with TestSessionLocal() as db:
        sub = Subtitle(
            video_id=video_id,
            start_time=start_time,
            end_time=start_time + 4.0,
            text_en="Shadow me if you can",
            sentence_index=0,
        )
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
        return sub.id


class TestCreateAttempt:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/shadowing/attempts",
            json={"video_id": "x", "audio_url": "/media/test.webm"},
        )
        assert resp.status_code == 401

    async def test_create_attempt_success(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()

        resp = await client.post(
            "/api/v1/shadowing/attempts",
            headers=auth_headers,
            json={
                "video_id": video_id,
                "audio_url": "/media/shadowing/test.webm",
                "duration_ms": 2500,
                "is_satisfied": True,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["video_id"] == video_id
        assert data["audio_url"] == "/media/shadowing/test.webm"
        assert data["duration_ms"] == 2500
        assert data["is_satisfied"] is True
        assert data["id"] is not None
        assert data["created_at"] is not None

        # Verify LearningEvent was emitted. D10: event value = shadowed
        # seconds when duration_ms is reported (2500ms -> 2s).
        async with TestSessionLocal() as db:
            result = await db.execute(
                select(LearningEvent).where(
                    LearningEvent.event_type == "shadowed_sentences",
                )
            )
            event = result.scalar_one_or_none()
            assert event is not None
            assert event.event_value == 2

    async def test_event_value_falls_back_to_sentence_count(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()

        # No duration_ms -> legacy semantics: value counts one sentence.
        resp = await client.post(
            "/api/v1/shadowing/attempts",
            headers=auth_headers,
            json={"video_id": video_id, "audio_url": "/media/shadowing/nodur.webm"},
        )
        assert resp.status_code == 201

        async with TestSessionLocal() as db:
            result = await db.execute(
                select(LearningEvent).where(
                    LearningEvent.event_type == "shadowed_sentences",
                )
            )
            event = result.scalar_one_or_none()
            assert event is not None
            assert event.event_value == 1

    async def test_create_attempt_increments_profile_counter(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()

        # Create two attempts
        for _ in range(2):
            await client.post(
                "/api/v1/shadowing/attempts",
                headers=auth_headers,
                json={"video_id": video_id, "audio_url": "/media/shadowing/a.webm"},
            )

        # Check profile counter
        me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
        async with TestSessionLocal() as db:
            result = await db.execute(
                select(UserLearningProfile).where(
                    UserLearningProfile.user_id == me["id"],
                )
            )
            profile = result.scalar_one_or_none()
            assert profile is not None
            assert profile.total_shadowing_count == 2


class TestListAttempts:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/shadowing/attempts?video_id=x")
        assert resp.status_code == 401

    async def test_list_attempts_by_video(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()

        # Create 3 attempts
        for i in range(3):
            await client.post(
                "/api/v1/shadowing/attempts",
                headers=auth_headers,
                json={
                    "video_id": video_id,
                    "audio_url": f"/media/shadowing/{i}.webm",
                    "duration_ms": 1000 + i,
                },
            )

        resp = await client.get(
            f"/api/v1/shadowing/attempts?video_id={video_id}&page=1&page_size=2",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["items"]) == 2
        assert data["has_more"] is True

        # Page 2
        resp2 = await client.get(
            f"/api/v1/shadowing/attempts?video_id={video_id}&page=2&page_size=2",
            headers=auth_headers,
        )
        data2 = resp2.json()
        assert len(data2["items"]) == 1
        assert data2["has_more"] is False

    async def test_include_subtitle_time_enriches_items(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()
        subtitle_id = await _seed_subtitle(video_id, start_time=12.5)

        await client.post(
            "/api/v1/shadowing/attempts",
            headers=auth_headers,
            json={
                "video_id": video_id,
                "subtitle_id": subtitle_id,
                "audio_url": "/media/shadowing/tl.webm",
            },
        )

        # Default listing keeps the legacy shape (no subtitle time).
        resp = await client.get(f"/api/v1/shadowing/attempts?video_id={video_id}", headers=auth_headers)
        item = resp.json()["items"][0]
        assert item["subtitle_start_time"] is None

        # Opt-in flag adds the subtitle start_time (D10 timeline).
        resp2 = await client.get(
            f"/api/v1/shadowing/attempts?video_id={video_id}&include_subtitle_time=true",
            headers=auth_headers,
        )
        item2 = resp2.json()["items"][0]
        assert item2["subtitle_start_time"] == 12.5

    async def test_include_subtitle_time_handles_missing_subtitle(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()

        # Attempt without subtitle_id: outer join yields NULL start_time.
        await client.post(
            "/api/v1/shadowing/attempts",
            headers=auth_headers,
            json={"video_id": video_id, "audio_url": "/media/shadowing/nosub.webm"},
        )

        resp = await client.get(
            f"/api/v1/shadowing/attempts?video_id={video_id}&include_subtitle_time=true",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert item["subtitle_start_time"] is None


class TestShadowingStats:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/shadowing/stats")
        assert resp.status_code == 401

    async def test_stats(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()

        # Create attempts: 2 satisfied, 1 not
        for i in range(3):
            await client.post(
                "/api/v1/shadowing/attempts",
                headers=auth_headers,
                json={
                    "video_id": video_id,
                    "audio_url": f"/media/shadowing/s{i}.webm",
                    "is_satisfied": i < 2,
                },
            )

        resp = await client.get("/api/v1/shadowing/stats", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_attempts"] == 3
        assert data["satisfied_count"] == 2
        assert data["videos_shadowed"] == 1
        assert data["today_count"] == 3


class TestDeleteAttempt:
    """``DELETE /shadowing/attempts/{id}`` — owner-only delete.

    Authorization rule: only the owner can delete. Non-owners get 404 (same
    as not found, so existence isn't leaked). Used by the watch page's
    "recent shadowing" list to let users clean up recordings they don't
    want to keep.
    """

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.delete("/api/v1/shadowing/attempts/anything")
        assert resp.status_code == 401

    async def test_delete_own_attempt_succeeds(self, client: AsyncClient, auth_headers: dict):
        video_id = await _seed_video()
        create = await client.post(
            "/api/v1/shadowing/attempts",
            headers=auth_headers,
            json={"video_id": video_id, "audio_url": "/media/shadowing/del.webm"},
        )
        attempt_id = create.json()["id"]

        resp = await client.delete(f"/api/v1/shadowing/attempts/{attempt_id}", headers=auth_headers)
        assert resp.status_code == 204

        # Subsequent listing should not return it.
        listing = await client.get(f"/api/v1/shadowing/attempts?video_id={video_id}", headers=auth_headers)
        assert listing.json()["total"] == 0

    async def test_delete_missing_returns_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.delete(
            "/api/v1/shadowing/attempts/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_delete_other_users_attempt_returns_404(self, client: AsyncClient, auth_headers: dict):
        """Non-owners must NOT learn whether the attempt exists. We return 404
        with the same message as the missing case so probing another user's
        attempts can't enumerate them."""
        # Owner creates an attempt.
        video_id = await _seed_video()
        create = await client.post(
            "/api/v1/shadowing/attempts",
            headers=auth_headers,
            json={"video_id": video_id, "audio_url": "/media/shadowing/owned.webm"},
        )
        attempt_id = create.json()["id"]

        # Spawn a second user with their own auth headers.
        other_phone = "13700137000"
        other_password = "Otherpass1!"
        async with TestSessionLocal() as db:
            other = User(
                phone=other_phone,
                hashed_password=hash_password(other_password),
                name="Other",
                plan=PlanType.free,
                role=RoleType.user,
            )
            db.add(other)
            await db.commit()
            await db.refresh(other)
            other_token = create_token(other.id)
        other_headers = {"Authorization": f"Bearer {other_token}"}

        resp = await client.delete(f"/api/v1/shadowing/attempts/{attempt_id}", headers=other_headers)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "录音不存在"

        # Original owner's attempt is still there.
        listing = await client.get(f"/api/v1/shadowing/attempts?video_id={video_id}", headers=auth_headers)
        assert listing.json()["total"] == 1

    async def test_delete_then_listing_drops_count(self, client: AsyncClient, auth_headers: dict):
        """After the owner deletes, the listing endpoint must reflect the
        removal (no cache, no zombie)."""
        video_id = await _seed_video()
        ids = []
        for i in range(2):
            create = await client.post(
                "/api/v1/shadowing/attempts",
                headers=auth_headers,
                json={
                    "video_id": video_id,
                    "audio_url": f"/media/shadowing/z{i}.webm",
                },
            )
            ids.append(create.json()["id"])

        # Delete the first.
        await client.delete(f"/api/v1/shadowing/attempts/{ids[0]}", headers=auth_headers)
        listing = await client.get(f"/api/v1/shadowing/attempts?video_id={video_id}", headers=auth_headers)
        data = listing.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == ids[1]


class TestUploadShadowingAudio:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/media/shadowing-audio",
            files={"file": ("test.webm", b"fake audio data", "audio/webm")},
        )
        assert resp.status_code == 401

    async def test_upload_audio_success(self, client: AsyncClient, auth_headers: dict, tmp_path):
        # Patch media path to tmp
        from unittest.mock import patch

        from app.core.config import get_settings

        settings = get_settings()
        with patch.object(settings, "local_media_path", str(tmp_path)):
            resp = await client.post(
                "/media/shadowing-audio",
                headers=auth_headers,
                files={"file": ("rec.webm", b"fake webm audio bytes", "audio/webm")},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "url" in data
        assert data["url"].startswith("/media/shadowing/")
        assert data["url"].endswith(".webm")

    async def test_upload_rejects_invalid_type(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/media/shadowing-audio",
            headers=auth_headers,
            files={"file": ("test.txt", b"not audio", "text/plain")},
        )
        assert resp.status_code == 415

    async def test_upload_accepts_webm_with_codec_param(self, client: AsyncClient, auth_headers: dict, tmp_path):
        # Chromium MediaRecorder reports "audio/webm;codecs=opus"; the MIME
        # parameter must not trip the allow-list (regression: 415).
        from unittest.mock import patch

        from app.core.config import get_settings

        settings = get_settings()
        with patch.object(settings, "local_media_path", str(tmp_path)):
            resp = await client.post(
                "/media/shadowing-audio",
                headers=auth_headers,
                files={"file": ("recording.webm", b"fake webm audio bytes", "audio/webm;codecs=opus")},
            )
        assert resp.status_code == 200
        assert resp.json()["url"].endswith(".webm")

    async def test_upload_rejects_empty_file(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/media/shadowing-audio",
            headers=auth_headers,
            files={"file": ("empty.webm", b"", "audio/webm")},
        )
        assert resp.status_code == 400
