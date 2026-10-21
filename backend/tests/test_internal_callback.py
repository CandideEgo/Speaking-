"""GPU 转写回调端点（``POST /api/v1/internal/transcription/callback``）的边界防护。

这是全仓**唯一**走共享密钥鉴权、且会写 Subtitle 并入队 tail 的端点：远端 GPU
机器转写完把结果 POST 回云端，云端写字幕、把视频推进到 ``ready_subtitles``，
再入队 tail（翻译 → 下载 → 转码）。它平时没有前端调用方，所以一旦回归只能等
到线上转写整条链路坏掉才发现——这里把它的不变量钉住：

1. **密钥错 / 缺 → 401**：这条链路没有 JWT，``X-Callback-Secret`` 是唯一的门。
2. **Redis 去重锁拿不到 → 503（fail-closed）**：宁可让 GPU worker 重试，也不能在
   没有锁的情况下并发写库（两个回调都读到 ``status == processing`` 会重复插字幕、
   重复入队 tail）。
3. **视频不在 ``processing`` → 幂等 acknowledged**：不写 Subtitle、不重复入队。
4. **正常回调 → 写 Subtitle + 入队 tail**（各一次）。
5. **同一视频两次回调 → 只有一次真写入**：锁还被别人占着时第二个回调拿 503；
   第一个已经跑完时第二个回调幂等 acknowledged。两种时序下字幕都只有一份、
   tail 只入队一次。

Redis 说明：端点用的是**同步** redis-py（``app/api/v1/internal.py`` 里
``import redis as redis_lib``），不是 ``app.core.redis`` 的异步 fake，所以这里直接
给 ``redis.from_url`` 打桩——既让 SETNX 语义（抢锁 / 放锁 / Redis 挂掉）可控，
又走的是与生产同一条代码路径（``_acquire_callback_lock`` 的 fail-closed 分支是
真的被执行到的）。

真并发写库在内存 SQLite 上不可靠（仓库里真正的并发用例都标 ``integration`` 跑真
Postgres），所以这里用两种**确定性时序**覆盖「两次回调只写一次」：锁被占用
（503）与回调已完成（幂等 acknowledged）。
"""

from __future__ import annotations

import uuid

import pytest
import redis as redis_lib
from sqlalchemy import func, select

from app.core.config import get_settings
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal

pytestmark = pytest.mark.unit

CALLBACK_URL = "/api/v1/internal/transcription/callback"
CALLBACK_SECRET = "unit-test-callback-secret"
FINALIZE_TASK = "app.tasks.video_processing.finalize_video"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _segments() -> list[dict]:
    """一份能过质量门的转写结果（见 ``app/services/transcription/quality.py``）。"""
    return [
        {"start": 0.0, "end": 3.0, "text": "The camera rolls into the room."},
        {"start": 3.0, "end": 6.5, "text": "She checks the old photograph."},
        {"start": 6.5, "end": 10.0, "text": "Nobody remembers the first take."},
    ]


def _payload(video_id: str, *, status: str = "ok", segments: list[dict] | None = None) -> dict:
    return {
        "video_id": video_id,
        "status": status,
        "segments": _segments() if segments is None else segments,
        "audio_duration": 12.0,
    }


def _headers(secret: str = CALLBACK_SECRET) -> dict:
    return {"X-Callback-Secret": secret}


async def _seed_video(*, status: VideoStatus = VideoStatus.processing) -> str:
    """种一条视频（默认在 processing，等 GPU 回传）。"""
    video_id = str(uuid.uuid4())
    async with TestSessionLocal() as db:
        db.add(
            Video(
                id=video_id,
                title="Callback fixture",
                source_url="https://example.com/callback-fixture.mp4",
                video_source=VideoSource.imported,
                status=status,
                is_official=True,
                is_published=True,
                review_status="published",
            )
        )
        await db.commit()
    return video_id


async def _subtitle_rows(video_id: str) -> list[Subtitle]:
    async with TestSessionLocal() as db:
        result = await db.execute(
            select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index)
        )
        return list(result.scalars().all())


async def _subtitle_count(video_id: str) -> int:
    async with TestSessionLocal() as db:
        return await db.scalar(select(func.count()).select_from(Subtitle).where(Subtitle.video_id == video_id))


async def _video_state(video_id: str) -> tuple[str, str | None, int | None]:
    """(status, processing_step, processing_progress)。"""
    async with TestSessionLocal() as db:
        video = (await db.execute(select(Video).where(Video.id == video_id))).scalar_one()
        return (video.status.value, video.processing_step, video.processing_progress)


def _finalize_calls(calls: list[tuple[str, tuple, dict]]) -> list[tuple[str, tuple, dict]]:
    """只挑 tail 入队（``finalize_video``）的记录。"""
    return [entry for entry in calls if entry[0] == FINALIZE_TASK]


class _FakeSyncRedis:
    """同步 Redis 替身：只实现回调去重锁用到的 SETNX / DELETE。

    语义与真 Redis 一致：``set(nx=True)`` 撞上已存在的 key 时返回 None（抢锁失败）。
    """

    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    def set(self, key: str, value: str, nx: bool = False, ex: int | None = None) -> bool | None:
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    def delete(self, key: str) -> int:
        return 1 if self.store.pop(key, None) is not None else 0


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def callback_secret(monkeypatch) -> str:
    """给端点一个确定的共享密钥（testing 环境默认是空 → 一律 401）。"""
    settings = get_settings()
    monkeypatch.setattr(settings, "transcription_callback_secret", CALLBACK_SECRET, raising=False)
    return CALLBACK_SECRET


@pytest.fixture
def redis_lock(monkeypatch) -> _FakeSyncRedis:
    """把同步 redis-py 的 ``from_url`` 换成可控替身（SETNX 语义）。"""
    fake = _FakeSyncRedis()

    def _from_url(*_args, **_kwargs):
        return fake

    monkeypatch.setattr(redis_lib, "from_url", _from_url)
    return fake


@pytest.fixture
def redis_down(monkeypatch) -> None:
    """模拟 Redis 挂掉：连不上就抛异常，端点必须 fail-closed（503）。"""

    def _from_url(*_args, **_kwargs):
        raise redis_lib.ConnectionError("redis is down")

    monkeypatch.setattr(redis_lib, "from_url", _from_url)


# ---------------------------------------------------------------------------
# 1. 共享密钥
# ---------------------------------------------------------------------------


class TestCallbackAuth:
    async def test_missing_secret_is_rejected(self, client, redis_lock, callback_secret, _mock_celery):
        video_id = await _seed_video()

        response = await client.post(CALLBACK_URL, json=_payload(video_id))

        assert response.status_code == 401
        assert response.json()["code"] == "HTTP_401"
        # 鉴权没过就什么都别做：不写字幕、不入队。
        assert await _subtitle_count(video_id) == 0
        assert _finalize_calls(_mock_celery) == []

    async def test_wrong_secret_is_rejected(self, client, redis_lock, callback_secret, _mock_celery):
        video_id = await _seed_video()

        response = await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers("wrong-secret"))

        assert response.status_code == 401
        assert response.json()["code"] == "HTTP_401"
        assert await _subtitle_count(video_id) == 0
        assert _finalize_calls(_mock_celery) == []

    async def test_non_ascii_secret_is_rejected_as_401_not_500(self, client, redis_lock, callback_secret, _mock_celery):
        """HTTP 头里的非 ASCII 密钥必须是 401，不能因为比较抛异常变成 500。

        共享密钥比较走 ``secrets.compare_digest``，它对非 ASCII 的 str 直接抛
        TypeError；而请求头是 latin-1 解码的，任何字节都进得来——不接住的话，
        拿非 ASCII 密钥探端点会把 401 变成 500。
        """
        video_id = await _seed_video()

        # HTTP 头是 latin-1 的，所以这里送原始字节；服务端解出来仍是非 ASCII 字符串。
        response = await client.post(
            CALLBACK_URL,
            json=_payload(video_id),
            headers={b"X-Callback-Secret": "sécret".encode("latin-1")},
        )

        assert response.status_code == 401
        assert response.json()["code"] == "HTTP_401"
        assert await _subtitle_count(video_id) == 0
        assert _finalize_calls(_mock_celery) == []


# ---------------------------------------------------------------------------
# 2. Redis 去重锁拿不到 → 503（fail-closed）
# ---------------------------------------------------------------------------


class TestCallbackRedisLock:
    async def test_redis_unavailable_returns_503_and_writes_nothing(
        self, client, redis_down, callback_secret, _mock_celery
    ):
        video_id = await _seed_video()

        response = await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers())

        assert response.status_code == 503
        assert response.json()["code"] == "HTTP_503"
        # fail-closed：宁可让 GPU worker 重试，也不能在没有锁的情况下写库。
        assert await _subtitle_count(video_id) == 0
        assert _finalize_calls(_mock_celery) == []
        # 视频仍停在 processing，等重试。
        status, _, _ = await _video_state(video_id)
        assert status == VideoStatus.processing.value


# ---------------------------------------------------------------------------
# 3. 幂等：视频不在 processing → acknowledged，且什么都不做
# ---------------------------------------------------------------------------


class TestCallbackIdempotency:
    @pytest.mark.parametrize("status", [VideoStatus.ready_subtitles, VideoStatus.ready])
    async def test_callback_after_transcription_is_acknowledged_without_writing(
        self, client, redis_lock, callback_secret, _mock_celery, status
    ):
        video_id = await _seed_video(status=status)

        response = await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers())

        assert response.status_code == 200
        assert response.json()["acknowledged"] is True
        # 重复回调（Celery 重投 / tail 已跑完）不得写库、不得重复入队。
        assert await _subtitle_count(video_id) == 0
        assert _finalize_calls(_mock_celery) == []

    async def test_callback_for_unknown_video_is_acknowledged(self, client, redis_lock, callback_secret, _mock_celery):
        response = await client.post(CALLBACK_URL, json=_payload(str(uuid.uuid4())), headers=_headers())

        # 视频已删除时也要 ack，好让 GPU worker 别再重试。
        assert response.status_code == 200
        assert response.json()["acknowledged"] is True
        assert _finalize_calls(_mock_celery) == []


# ---------------------------------------------------------------------------
# 4. 正常回调：写 Subtitle + 入队 tail
# ---------------------------------------------------------------------------


class TestCallbackSuccess:
    async def test_successful_callback_writes_subtitles_and_enqueues_tail(
        self, client, redis_lock, callback_secret, _mock_celery
    ):
        video_id = await _seed_video()

        response = await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers())

        assert response.status_code == 200, response.text
        assert response.json()["acknowledged"] is True

        rows = await _subtitle_rows(video_id)
        assert len(rows) == 3
        assert [row.sentence_index for row in rows] == [0, 1, 2]
        assert [row.text_en for row in rows] == [segment["text"] for segment in _segments()]
        assert rows[0].start_time == 0.0
        assert rows[0].end_time == 3.0

        status, step, progress = await _video_state(video_id)
        assert status == VideoStatus.ready_subtitles.value
        assert step == "translating"
        assert progress == 70

        # tail 只入队一次，且带上视频 id。
        assert _finalize_calls(_mock_celery) == [(FINALIZE_TASK, (video_id,), {})]


# ---------------------------------------------------------------------------
# 5. 两次回调 → 只有一次真写入
# ---------------------------------------------------------------------------


class TestCallbackConcurrency:
    async def test_second_callback_while_lock_is_held_is_rejected(
        self, client, redis_lock, callback_secret, _mock_celery
    ):
        """第一个回调还在飞（锁被占着）→ 第二个拿 503，且不碰数据库。"""
        video_id = await _seed_video()
        redis_lock.store[f"video:callback:{video_id}"] = "1"

        response = await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers())

        assert response.status_code == 503
        assert await _subtitle_count(video_id) == 0
        assert _finalize_calls(_mock_celery) == []
        status, _, _ = await _video_state(video_id)
        assert status == VideoStatus.processing.value

    async def test_repeated_callback_writes_subtitles_only_once(
        self, client, redis_lock, callback_secret, _mock_celery
    ):
        """同一个视频回调两次（GPU 重投）→ 字幕只有一份，tail 只入队一次。"""
        video_id = await _seed_video()

        first = await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers())
        assert first.status_code == 200, first.text
        assert first.json()["acknowledged"] is True
        assert await _subtitle_count(video_id) == 3

        second = await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers())

        assert second.status_code == 200
        assert second.json()["acknowledged"] is True
        # 只写一次：字幕仍是 3 行（不是 6 行），tail 也只入队一次。
        assert await _subtitle_count(video_id) == 3
        assert len(_finalize_calls(_mock_celery)) == 1
        # 第一个回调结束时释放了锁，重试能继续抢到。
        assert f"video:callback:{video_id}" not in redis_lock.store
