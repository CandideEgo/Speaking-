"""D0 unlock model — Free monthly unlock quota, signup trial, detail/media gates.

Covers 产品设计规划-2026-08 §2:
- registration grants a 3-day Pro trial (plan_source='trial')
- Free detail gate: metadata visible, subtitles/URLs withheld until unlocked
- POST /videos/{id}/unlock consumes quota, idempotent, 409 when exhausted
- unlocks are permanent; quota counts only the current calendar month
- demo videos never consume quota; Pro never writes unlock rows
- GET /videos/unlocked + /videos/unlocked-ids for the /history tab and badges
- redeeming during the trial stacks from the trial end date
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from tests.conftest import TestSessionLocal


async def _seed_ready_video(db, *, title: str = "Unlock Test", is_demo: bool = False, with_subtitle: bool = True):
    """Insert an official, published, ready video (optionally with 1 subtitle)."""
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoReviewStatus, VideoStatus

    video = Video(
        title=title,
        source_url=f"https://www.youtube.com/watch?v={abs(hash(title)) % 10**11:011d}",
        video_source="imported",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
        review_status=VideoReviewStatus.published.value,
        video_url_720p=f"/media/video-{title}.mp4",
        is_demo=is_demo,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    if with_subtitle:
        db.add(
            Subtitle(
                video_id=video.id,
                start_time=0.0,
                end_time=2.0,
                text_en="Hello world",
                text_zh="你好世界",
                sentence_index=0,
            )
        )
        await db.commit()
    return video


class TestSignupTrial:
    async def test_register_grants_trial_pro(self, client: AsyncClient):
        import app.services.sms_service as sms_svc

        # Dev-fake SMS mode (code "1234").
        original = sms_svc._real_send_enabled
        sms_svc._real_send_enabled = lambda: False
        try:
            await client.post("/api/v1/auth/sms/send-code", json={"phone": "13600136000", "purpose": "register"})
            resp = await client.post(
                "/api/v1/auth/sms/register",
                json={"phone": "13600136000", "code": "1234", "password": "Testpass123!"},
            )
        finally:
            sms_svc._real_send_enabled = original
        assert resp.status_code == 201, resp.text
        user_payload = resp.json()["user"]
        assert user_payload["plan"] == "pro"
        assert user_payload["plan_expires_at"] is not None

        # DB-level: plan_source marks the trial; expiry is ~trial_days out.
        from app.core.config import get_settings
        from app.models.user import User

        async with TestSessionLocal() as db:
            user = (await db.execute(select(User).where(User.phone == "13600136000"))).scalar_one()
            assert user.plan_source == "trial"
            assert user.plan_expires_at is not None
            expires = user.plan_expires_at
            if expires.tzinfo is None:  # SQLite returns naive datetimes
                expires = expires.replace(tzinfo=UTC)
            delta = expires - datetime.now(UTC)
            expected = get_settings().trial_days
            assert timedelta(days=expected - 1) < delta <= timedelta(days=expected)


class TestFreeDetailGate:
    async def test_locked_detail_hides_subtitles_and_urls(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="LockedOne")
        resp = await client.get(f"/api/v1/videos/{video.id}", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        # Metadata stays visible for the unlock panel...
        assert data["title"] == "LockedOne"
        assert data["thumbnail_url"] is None or isinstance(data["thumbnail_url"], str)
        # ...but no playable content leaks.
        assert data["subtitles"] == []
        assert data["video_url_720p"] is None
        access = data["access"]
        assert access["unlocked"] is False
        assert access["remaining_this_month"] == 3
        assert access["quota"] == 3

    async def test_pro_detail_unlocked_with_subtitles(self, client: AsyncClient, pro_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="ProSeesAll")
        resp = await client.get(f"/api/v1/videos/{video.id}", headers=pro_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["subtitles"]) == 1
        assert data["video_url_720p"] == "/media/video-ProSeesAll.mp4"
        assert data["access"]["unlocked"] is True
        assert data["access"]["remaining_this_month"] is None

    async def test_demo_video_open_for_free(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="DemoVid", is_demo=True)
        resp = await client.get(f"/api/v1/videos/{video.id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["access"]["unlocked"] is True
        assert data["access"]["remaining_this_month"] == 3  # untouched
        assert len(data["subtitles"]) == 1


class TestUnlockFlow:
    async def test_unlock_requires_auth(self, client: AsyncClient, db_session):
        video = await _seed_ready_video(db_session, title="NoAuth")
        resp = await client.post(f"/api/v1/videos/{video.id}/unlock")
        assert resp.status_code == 401

    async def test_unlock_unknown_video_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/v1/videos/does-not-exist/unlock", headers=auth_headers)
        assert resp.status_code == 404

    async def test_unlock_consumes_quota_and_grants_access(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="UnlockMe")

        resp = await client.post(f"/api/v1/videos/{video.id}/unlock", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        access = resp.json()["access"]
        assert access["unlocked"] is True
        assert access["remaining_this_month"] == 2

        # Detail now serves subtitles + URLs.
        detail = (await client.get(f"/api/v1/videos/{video.id}", headers=auth_headers)).json()
        assert len(detail["subtitles"]) == 1
        assert detail["video_url_720p"] is not None
        assert detail["access"]["unlocked"] is True

    async def test_reunlock_is_idempotent(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="Twice")
        await client.post(f"/api/v1/videos/{video.id}/unlock", headers=auth_headers)
        resp = await client.post(f"/api/v1/videos/{video.id}/unlock", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["access"]["remaining_this_month"] == 2

    async def test_quota_exhausted_returns_409(self, client: AsyncClient, auth_headers: dict, db_session):
        videos = [await _seed_ready_video(db_session, title=f"Exhaust{i}", with_subtitle=False) for i in range(4)]
        for v in videos[:3]:
            resp = await client.post(f"/api/v1/videos/{v.id}/unlock", headers=auth_headers)
            assert resp.status_code == 200
        resp = await client.post(f"/api/v1/videos/{videos[3].id}/unlock", headers=auth_headers)
        assert resp.status_code == 409
        detail = resp.json()["detail"]
        assert detail["remaining"] == 0
        assert detail["quota"] == 3

        # The locked detail for the 4th video reports 0 remaining.
        d = (await client.get(f"/api/v1/videos/{videos[3].id}", headers=auth_headers)).json()
        assert d["access"]["unlocked"] is False
        assert d["access"]["remaining_this_month"] == 0

    async def test_pro_unlock_writes_no_row(self, client: AsyncClient, pro_headers: dict, db_session):
        from app.models.user_video_unlock import UserVideoUnlock

        video = await _seed_ready_video(db_session, title="ProNoRow")
        resp = await client.post(f"/api/v1/videos/{video.id}/unlock", headers=pro_headers)
        assert resp.status_code == 200
        assert resp.json()["access"]["unlocked"] is True
        rows = (await db_session.execute(select(UserVideoUnlock))).scalars().all()
        assert rows == []

    async def test_demo_unlock_consumes_nothing(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="DemoFree", is_demo=True, with_subtitle=False)
        resp = await client.post(f"/api/v1/videos/{video.id}/unlock", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["access"]["remaining_this_month"] == 3


class TestMonthlyReset:
    async def test_last_month_unlocks_do_not_count(self, client: AsyncClient, auth_headers: dict, db_session):
        """Quota counts only the current calendar month; old rows stay valid."""
        from app.models.user import User
        from app.models.user_video_unlock import UserVideoUnlock

        user = (await db_session.execute(select(User).where(User.phone == "13800138000"))).scalar_one()

        # Two unlocks dated last month (permanent access, out of quota scope).
        old_videos = [await _seed_ready_video(db_session, title=f"Old{i}", with_subtitle=False) for i in range(2)]
        now = datetime.now(UTC)
        last_month = (now.replace(day=1) - timedelta(days=1)).replace(hour=12)
        for v in old_videos:
            db_session.add(UserVideoUnlock(user_id=user.id, video_id=v.id, unlocked_at=last_month))
        await db_session.commit()

        # Old unlocks still grant access...
        d = (await client.get(f"/api/v1/videos/{old_videos[0].id}", headers=auth_headers)).json()
        assert d["access"]["unlocked"] is True
        # ...and this month's quota is untouched.
        assert d["access"]["remaining_this_month"] == 3


class TestUnlockedList:
    async def test_list_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/v1/videos/unlocked")).status_code == 401
        assert (await client.get("/api/v1/videos/unlocked-ids")).status_code == 401

    async def test_unlocked_list_and_ids(self, client: AsyncClient, auth_headers: dict, db_session):
        v1 = await _seed_ready_video(db_session, title="ListOne", with_subtitle=False)
        v2 = await _seed_ready_video(db_session, title="ListTwo", with_subtitle=False)
        await client.post(f"/api/v1/videos/{v1.id}/unlock", headers=auth_headers)
        await client.post(f"/api/v1/videos/{v2.id}/unlock", headers=auth_headers)

        resp = await client.get("/api/v1/videos/unlocked", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        # Newest unlock first.
        assert [item["title"] for item in data["items"]] == ["ListTwo", "ListOne"]

        ids = (await client.get("/api/v1/videos/unlocked-ids", headers=auth_headers)).json()["video_ids"]
        assert set(ids) == {v1.id, v2.id}

    async def test_unlocked_list_excludes_unpublished(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="ThenHidden", with_subtitle=False)
        await client.post(f"/api/v1/videos/{video.id}/unlock", headers=auth_headers)
        video.is_published = False
        await db_session.commit()

        data = (await client.get("/api/v1/videos/unlocked", headers=auth_headers)).json()
        assert data["total"] == 0


class TestRedeemDuringTrial:
    async def test_redeem_stacks_from_trial_end(self, client: AsyncClient, db_session):
        """A redeem code entered during the trial extends from the trial end
        date (max(current_expires, now) + duration), not from now."""
        from app.models.redeem import RedeemCode, RedeemStatus
        from app.models.user import PlanType, User

        trial_end = datetime.now(UTC) + timedelta(days=2)
        user = User(
            phone="13500135000",
            hashed_password="x",
            name="Trial User",
            plan=PlanType.pro,
            plan_expires_at=trial_end,
            plan_source="trial",
        )
        db_session.add(user)
        db_session.add(
            RedeemCode(
                code="TRIALSTACK01",
                plan=PlanType.pro,
                duration_days=30,
                status=RedeemStatus.unused,
                expires_at=datetime.now(UTC) + timedelta(days=90),
            )
        )
        await db_session.commit()
        await db_session.refresh(user)

        from app.core.security import create_token

        resp = await client.post(
            "/api/v1/redeem-codes/redeem",
            headers={"Authorization": f"Bearer {create_token(user.id)}"},
            json={"code": "TRIALSTACK01"},
        )
        assert resp.status_code == 200, resp.text
        new_expires = datetime.fromisoformat(resp.json()["plan_expires_at"])
        # 30 days after the trial end — not 30 days after now.
        expected = trial_end + timedelta(days=30)
        assert abs((new_expires - expected).total_seconds()) < 5

        # plan_source flips to the latest entitlement origin.
        async with TestSessionLocal() as db:
            fresh = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
            assert fresh.plan_source == "redeem"
