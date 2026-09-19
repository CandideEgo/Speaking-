"""内测免费开放 — 门控解除后的访问行为（需求 §2.3）+ 保留的 dormant 逻辑。

Covers:
- registration still grants the 3-day trial (plan fields dormant but intact)
- 登录用户对已发布视频直接可看：详情带字幕/URL，access.unlocked=True
- 匿名仍拒（登录墙），示范视频 is_demo 对匿名开放（落地页预留）
- POST /videos/{id}/unlock 已退役：不消耗额度、恒返回放行 access
- GET /videos/unlocked + /unlocked-ids 已退役：返回空载荷（表 dormant 保留）
- shadowing-sentences 对登录用户放行
- redeeming during the trial stacks from the trial end date（dormant 逻辑保留）
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
    async def test_free_detail_serves_subtitles_and_urls(self, client: AsyncClient, auth_headers: dict, db_session):
        """内测免费期：登录用户无需解锁即可拿到字幕与可播放 URL。"""
        video = await _seed_ready_video(db_session, title="LockedOne")
        resp = await client.get(f"/api/v1/videos/{video.id}", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["title"] == "LockedOne"
        # 门控解除：内容直接下发。
        assert len(data["subtitles"]) == 1
        assert data["video_url_720p"] == "/media/video-LockedOne.mp4"
        access = data["access"]
        assert access["unlocked"] is True
        assert access["remaining_this_month"] is None  # 不限量

    async def test_pro_detail_unlocked_with_subtitles(self, client: AsyncClient, pro_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="ProSeesAll")
        resp = await client.get(f"/api/v1/videos/{video.id}", headers=pro_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["subtitles"]) == 1
        assert data["video_url_720p"] == "/media/video-ProSeesAll.mp4"
        assert data["access"]["unlocked"] is True
        assert data["access"]["remaining_this_month"] is None

    async def test_anonymous_detail_stays_locked(self, client: AsyncClient, db_session):
        """匿名仍不进：详情不下发字幕/URL（登录墙语义保留）。"""
        video = await _seed_ready_video(db_session, title="AnonLocked")
        resp = await client.get(f"/api/v1/videos/{video.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["subtitles"] == []
        assert data["video_url_720p"] is None
        assert data["access"]["unlocked"] is False

    async def test_demo_video_open_for_free(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="DemoVid", is_demo=True)
        resp = await client.get(f"/api/v1/videos/{video.id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["access"]["unlocked"] is True
        assert len(data["subtitles"]) == 1


class TestUnlockFlow:
    async def test_unlock_requires_auth(self, client: AsyncClient, db_session):
        video = await _seed_ready_video(db_session, title="NoAuth")
        resp = await client.post(f"/api/v1/videos/{video.id}/unlock")
        assert resp.status_code == 401

    async def test_unlock_unknown_video_404(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/v1/videos/does-not-exist/unlock", headers=auth_headers)
        assert resp.status_code == 404

    async def test_unlock_is_retired_no_quota_no_row(self, client: AsyncClient, auth_headers: dict, db_session):
        """内测期退役：调用返回放行 access，且不写 user_video_unlocks 行。"""
        from app.models.user_video_unlock import UserVideoUnlock

        video = await _seed_ready_video(db_session, title="UnlockMe")

        resp = await client.post(f"/api/v1/videos/{video.id}/unlock", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        access = resp.json()["access"]
        assert access["unlocked"] is True
        assert access["remaining_this_month"] is None

        rows = (await db_session.execute(select(UserVideoUnlock))).scalars().all()
        assert rows == []

        # 详情无需解锁即可播放。
        detail = (await client.get(f"/api/v1/videos/{video.id}", headers=auth_headers)).json()
        assert len(detail["subtitles"]) == 1
        assert detail["video_url_720p"] is not None

    async def test_no_quota_exhaustion_anymore(self, client: AsyncClient, auth_headers: dict, db_session):
        """额度概念已废：连开 4 个视频不再有 409。"""
        videos = [await _seed_ready_video(db_session, title=f"Exhaust{i}", with_subtitle=False) for i in range(4)]
        for v in videos:
            resp = await client.post(f"/api/v1/videos/{v.id}/unlock", headers=auth_headers)
            assert resp.status_code == 200, resp.text
            assert resp.json()["access"]["unlocked"] is True

        d = (await client.get(f"/api/v1/videos/{videos[3].id}", headers=auth_headers)).json()
        assert d["access"]["unlocked"] is True

    async def test_pro_unlock_writes_no_row(self, client: AsyncClient, pro_headers: dict, db_session):
        from app.models.user_video_unlock import UserVideoUnlock

        video = await _seed_ready_video(db_session, title="ProNoRow")
        resp = await client.post(f"/api/v1/videos/{video.id}/unlock", headers=pro_headers)
        assert resp.status_code == 200
        assert resp.json()["access"]["unlocked"] is True
        rows = (await db_session.execute(select(UserVideoUnlock))).scalars().all()
        assert rows == []


class TestRetiredUnlockLists:
    """解锁列表端点已退役：返回空载荷（表 dormant 保留）。"""

    async def test_list_requires_auth(self, client: AsyncClient):
        assert (await client.get("/api/v1/videos/unlocked")).status_code == 401
        assert (await client.get("/api/v1/videos/unlocked-ids")).status_code == 401

    async def test_unlocked_list_returns_empty(self, client: AsyncClient, auth_headers: dict, db_session):
        await _seed_ready_video(db_session, title="ListOne", with_subtitle=False)
        await _seed_ready_video(db_session, title="ListTwo", with_subtitle=False)

        resp = await client.get("/api/v1/videos/unlocked", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

        ids_resp = (await client.get("/api/v1/videos/unlocked-ids", headers=auth_headers)).json()
        assert ids_resp["video_ids"] == []
        assert ids_resp["remaining_this_month"] is None


class TestShadowingSentencesGate:
    """EndScreen 跟读重点句端点：内测免费期对登录用户放行（门控解除）。"""

    async def test_logged_in_user_gets_sentences(self, client: AsyncClient, auth_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="LockedSentences")
        resp = await client.get(f"/api/v1/videos/{video.id}/shadowing-sentences", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()
        assert items and items[0]["text_en"] == "Hello world"

    async def test_anonymous_requires_auth(self, client: AsyncClient, db_session):
        video = await _seed_ready_video(db_session, title="AnonSentences")
        resp = await client.get(f"/api/v1/videos/{video.id}/shadowing-sentences")
        assert resp.status_code == 401

    async def test_pro_sees_sentences(self, client: AsyncClient, pro_headers: dict, db_session):
        video = await _seed_ready_video(db_session, title="ProSentences")
        resp = await client.get(f"/api/v1/videos/{video.id}/shadowing-sentences", headers=pro_headers)
        assert resp.status_code == 200


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
