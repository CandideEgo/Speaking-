"""首页编辑内容：并发 / 竞态回归（乐观锁、条件 UPDATE、TOCTOU）。

钉住三件事：

- **F4 生成写回 TOCTOU**：worker 读到草稿之后、管理员保存草稿之前的那段窗口里，
  AI 结果不许盖掉人工内容——必须判冲突、保留人工内容、任务状态可见。
- **F5 读-改-写竞态**：两个管理员同时保存 / 发布 / 回滚同一份草稿或编排时，
  后到的那个必须拿到 **409**（而不是静默覆盖对方）；版本号分配撞车也不该泄成
  500 ``INTERNAL_ERROR``。
- **G4A 布局乐观锁**：「发布并替换位置」期间编排被别人改过 → 整笔拒绝，
  不覆盖别人的编排草稿。

并发是**确定性模拟**的：把「另一个管理员的写入」插到被测调用内部的一个已知钩子
（``_get_or_create_draft`` / ``_get_draft`` / ``_load_subtitles`` /
``_validate_layout`` / ``_is_publicly_visible``）上，精确复现 TOCTOU 窗口。真实
线程并发在内存 SQLite（默认测试库）上不可靠，而这里的每一处窗口都是真实存在的
（生产是 Postgres，条件 UPDATE 在两种库上都真的生效）。
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.core.errors import ErrorCode
from app.models.home_content import HomeContentDraft, HomeContentRevision, HomePageConfig
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus
from app.services import home_content_service
from tests.conftest import TestSessionLocal

ADMIN = "/api/v1/admin/home-content"

SENTENCES = [
    ("If you look closely, you can spot the difference.", "如果你仔细看，就能发现差别。"),
    ("The color of the sky changes at dusk.", "天空的颜色在黄昏时变化。"),
    ("Most people miss it on the first look.", "大多数人第一次看时会错过。"),
]


# ---------------------------------------------------------------------------
# helpers（与 tests/test_home_content.py 同风格，但本文件自包含）
# ---------------------------------------------------------------------------


async def make_video(db, *, title="A closer look", published=True) -> tuple[Video, list[Subtitle]]:
    video = Video(
        title=title,
        source_url=f"https://example.com/{title}",
        video_source="local",
        status=VideoStatus.ready,
        is_official=True,
        is_published=published,
        duration=140.0,
        thumbnail_url="https://example.com/thumb.jpg",
        storage_mode="local",
    )
    db.add(video)
    await db.flush()
    subtitles = [
        Subtitle(
            video_id=video.id,
            sentence_index=index,
            start_time=index * 5.0,
            end_time=index * 5.0 + 4.0,
            text_en=text_en,
            text_zh=text_zh,
        )
        for index, (text_en, text_zh) in enumerate(SENTENCES)
    ]
    db.add_all(subtitles)
    await db.commit()
    return video, subtitles


def draft_payload(subtitles: list[Subtitle], *, headline: str = "换个角度，先看细节") -> dict:
    return {
        "headline": headline,
        "dek": "用一分钟学会从细节里读懂画面，也顺手记住 spot the difference。",
        "topic_label": "观察",
        "evidence_subtitle_ids": [subtitles[0].id],
        "clip": {"start_subtitle_id": subtitles[0].id, "end_subtitle_id": subtitles[1].id},
        "expressions": [
            {
                "id": "spot-difference",
                "subtitle_id": subtitles[0].id,
                "phrase": "spot the difference",
                "word": "spot",
                "gloss_zh": "v. 发现；辨认出",
                "note_zh": "口语里常用来指「找出不同」。",
            }
        ],
        "interaction": {
            "id": "first-look",
            "question": "如果是你，会先看哪里？",
            "options": [
                {"id": "detail", "label": "脸和手的细节", "feedback": "你会先注意到人的小动作。"},
                {"id": "color", "label": "颜色和光线", "feedback": "你会先被整体氛围抓住。"},
            ],
        },
        "scenarios": [
            {
                "id": "rain-check",
                "situation_zh": "约朋友·临时有事",
                "prompt_zh": "朋友约你今晚吃饭，试着回一句。",
                "reply_en": "Can I take a rain check?",
                "reply_zh": "这次先不了，下次再约好吗？",
                "subtitle_id": subtitles[1].id,
            }
        ],
    }


async def save_draft(client, headers, video: Video, payload: dict, expected_revision: int = 0):
    return await client.put(
        f"{ADMIN}/videos/{video.id}/draft",
        headers=headers,
        json={"payload": payload, "expected_revision": expected_revision},
    )


async def publish(client, headers, video: Video, expected_revision: int, place: str | None = None):
    return await client.post(
        f"{ADMIN}/videos/{video.id}/publish",
        headers=headers,
        json={"expected_revision": expected_revision, "place": place},
    )


async def save_layout(client, headers, layout: dict, expected_revision: int):
    return await client.put(
        f"{ADMIN}/layout/draft",
        headers=headers,
        json={"layout": layout, "expected_revision": expected_revision},
    )


async def layout_state(client, headers) -> dict:
    response = await client.get(f"{ADMIN}/layout", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# --- 「另一个管理员」的并发写入（都在**另一个 session** 里做并提交） ---


async def save_draft_in_other_session(video_id: str, payload: dict) -> int:
    """另一个管理员保存草稿（revision +1、payload 换成人写内容）。返回新 revision。"""
    async with TestSessionLocal() as db:
        draft = (await db.execute(select(HomeContentDraft).where(HomeContentDraft.video_id == video_id))).scalar_one()
        draft.payload = payload
        draft.revision += 1
        draft.updated_at = datetime.now(UTC)
        await db.commit()
        return draft.revision


async def bump_layout_revision_in_other_session() -> int:
    """另一个管理员改了首页编排（revision +1，内容不动）。返回新 revision。"""
    async with TestSessionLocal() as db:
        config = (
            await db.execute(
                select(HomePageConfig).where(HomePageConfig.id == home_content_service.LAYOUT_SINGLETON_ID)
            )
        ).scalar_one()
        config.revision += 1
        config.updated_at = datetime.now(UTC)
        await db.commit()
        return config.revision


async def draft_snapshot(video_id: str) -> dict:
    """读回草稿现状（payload / revision / 生成任务状态）。"""
    async with TestSessionLocal() as db:
        draft = (await db.execute(select(HomeContentDraft).where(HomeContentDraft.video_id == video_id))).scalar_one()
        return {
            "payload": draft.payload,
            "revision": draft.revision,
            "status": draft.status,
            "error_code": draft.generation_error_code,
            "active_generation_id": draft.active_generation_id,
        }


async def revision_versions(db) -> list[int]:
    rows = (await db.execute(select(HomeContentRevision))).scalars().all()
    return sorted(row.version for row in rows)


# ---------------------------------------------------------------------------
# F4：生成写回 TOCTOU
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generation_write_back_loses_to_admin_save_in_the_same_window(db_session, monkeypatch):
    """写回期间管理员保存了草稿 → 判冲突，**人工内容保留**（AI payload 不许盖上去）。

    旧实现用内存里那份可能已陈旧的 ``draft.revision`` 做校验，最后 ``commit()``
    直接写回：管理员的人工内容被 AI 结果盖掉，而 revision 计数器看不出发生过冲突。
    """
    video, subtitles = await make_video(db_session)
    video_id = video.id  # 冲突会回滚事务（ORM 属性随之过期），先存成字符串
    claim = await home_content_service.claim_generation(db_session, video_id, None)
    admin_payload = draft_payload(subtitles, headline="管理员手写标题")
    ai_payload = draft_payload(subtitles, headline="AI 迟到的标题")

    # worker 已经读到草稿（revision=0）；把管理员的保存插进「读到」与「写回」之间。
    original = home_content_service._load_subtitles
    fired = {"n": 0}

    async def _hook(db, video_id):
        fired["n"] += 1
        if fired["n"] == 1:
            await save_draft_in_other_session(video_id, admin_payload)
        return await original(db, video_id)

    monkeypatch.setattr(home_content_service, "_load_subtitles", _hook)

    assert not await home_content_service.complete_generation(db_session, claim.generation_id, ai_payload)

    snap = await draft_snapshot(video_id)
    assert snap["payload"]["headline"] == "管理员手写标题"  # 人工内容没被盖掉
    assert snap["revision"] == 1  # 只有管理员那次保存 +1（AI 没写进来）
    assert snap["status"] == "failed"  # 冲突是可见的失败，不是静默成功
    assert snap["error_code"] == ErrorCode.HOME_CONTENT_CONFLICT
    assert snap["active_generation_id"] is None


@pytest.mark.asyncio
async def test_generation_write_back_succeeds_without_concurrent_edit(db_session):
    """对照组：没有并发编辑时，写回照常成功（条件 UPDATE 没有把正常路径弄坏）。"""
    video, subtitles = await make_video(db_session)
    video_id = video.id
    claim = await home_content_service.claim_generation(db_session, video_id, None)
    ai_payload = draft_payload(subtitles, headline="AI 生成的标题")

    assert await home_content_service.complete_generation(db_session, claim.generation_id, ai_payload)

    snap = await draft_snapshot(video_id)
    assert snap["payload"]["headline"] == "AI 生成的标题"
    assert snap["revision"] == 1
    assert snap["status"] == "succeeded"


# ---------------------------------------------------------------------------
# F5：草稿保存 / 发布的读-改-写竞态
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_draft_save_returns_409_and_keeps_the_winner(client, admin_headers, db_session, monkeypatch):
    """两个管理员基于同一个 revision 保存 → 后到的那个 409，先提交的内容保留。

    旧实现是「读-改-写」：两笔事务都读到 revision=1、都通过校验、都写 revision=2，
    B 覆盖 A，而 A 也收到 200。
    """
    video, subtitles = await make_video(db_session)
    payload_a = draft_payload(subtitles, headline="管理员 A 的标题")
    payload_b = draft_payload(subtitles, headline="管理员 B 的标题")
    assert (await save_draft(client, admin_headers, video, payload_a)).status_code == 200

    # A 与 B 都读到 revision=1：把 B 的提交插到 A 的「读完之后、写之前」。
    original = home_content_service._get_or_create_draft

    async def _hook(db, video_id):
        draft = await original(db, video_id)
        await save_draft_in_other_session(video_id, payload_b)
        return draft

    monkeypatch.setattr(home_content_service, "_get_or_create_draft", _hook)

    response = await save_draft(client, admin_headers, video, payload_a, expected_revision=1)
    assert response.status_code == 409
    assert response.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT

    snap = await draft_snapshot(video.id)
    assert snap["payload"]["headline"] == "管理员 B 的标题"  # A 没有静默覆盖 B
    assert snap["revision"] == 2


@pytest.mark.asyncio
async def test_publish_with_stale_revision_is_409_and_creates_no_version(
    client, admin_headers, db_session, monkeypatch
):
    """发布期间草稿被改过 → 409，且**不产生任何已发布版本**（不该抛 IntegrityError/500）。"""
    video, subtitles = await make_video(db_session)
    assert (await save_draft(client, admin_headers, video, draft_payload(subtitles))).status_code == 200

    original = home_content_service._get_draft
    fired = {"n": 0}

    async def _hook(db, video_id):
        draft = await original(db, video_id)
        fired["n"] += 1
        if fired["n"] == 1:
            await save_draft_in_other_session(video_id, draft_payload(subtitles, headline="并发保存的标题"))
        return draft

    monkeypatch.setattr(home_content_service, "_get_draft", _hook)

    response = await publish(client, admin_headers, video, expected_revision=1)
    assert response.status_code == 409
    assert response.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT
    assert await revision_versions(db_session) == []


@pytest.mark.asyncio
async def test_publish_retries_when_version_number_is_already_taken(client, admin_headers, db_session, monkeypatch):
    """版本号分配读到陈旧的 max（撞唯一约束）→ 重算重试，不能泄成 500。"""
    video, subtitles = await make_video(db_session)
    assert (await save_draft(client, admin_headers, video, draft_payload(subtitles))).status_code == 200
    first = await publish(client, admin_headers, video, expected_revision=1)
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1

    original = home_content_service._next_version
    calls = {"n": 0}

    async def _fake_next_version(db, video_id):
        calls["n"] += 1
        if calls["n"] == 1:
            return 1  # 已经被占用的版本号 → INSERT 撞唯一约束
        return await original(db, video_id)

    monkeypatch.setattr(home_content_service, "_next_version", _fake_next_version)

    second = await publish(client, admin_headers, video, expected_revision=1)
    assert second.status_code == 200, second.text
    assert second.json()["version"] == 2
    assert await revision_versions(db_session) == [1, 2]


@pytest.mark.asyncio
async def test_publish_version_collision_ends_as_409_not_500(client, admin_headers, db_session, monkeypatch):
    """版本号一直撞车 → 409（可读），绝不是 IntegrityError 泄成 500 INTERNAL_ERROR。"""

    async def _always_taken(db, video_id):
        return 1

    video, subtitles = await make_video(db_session)
    assert (await save_draft(client, admin_headers, video, draft_payload(subtitles))).status_code == 200
    assert (await publish(client, admin_headers, video, expected_revision=1)).status_code == 200

    monkeypatch.setattr(home_content_service, "_next_version", _always_taken)

    response = await publish(client, admin_headers, video, expected_revision=1)
    assert response.status_code == 409, response.text
    assert response.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT
    assert await revision_versions(db_session) == [1]


@pytest.mark.asyncio
async def test_concurrent_draft_creation_does_not_leak_integrity_error(db_session, monkeypatch):
    """两个请求同时给同一视频建草稿 → 撞唯一约束的那笔重读已有行，不泄 IntegrityError。"""
    video, _ = await make_video(db_session)
    async with TestSessionLocal() as other:
        other.add(
            HomeContentDraft(
                video_id=video.id,
                payload=None,
                schema_version=1,
                revision=0,
                status="idle",
                generation_calls=0,
            )
        )
        await other.commit()

    # 本请求的「先查」落在竞态窗口里（看不见对方刚建好的行）。
    original = home_content_service._get_draft
    seen = {"n": 0}

    async def _hook(db, video_id):
        seen["n"] += 1
        if seen["n"] == 1:
            return None
        return await original(db, video_id)

    monkeypatch.setattr(home_content_service, "_get_draft", _hook)

    draft = await home_content_service._get_or_create_draft(db_session, video.id)
    assert draft.video_id == video.id
    assert draft.revision == 0
    rows = (await db_session.execute(select(HomeContentDraft))).scalars().all()
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# F5 / G4A：首页编排（布局）的乐观锁
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_layout_endpoints_reject_stale_revision(client, admin_headers, db_session):
    """过期 revision 的保存 / 发布 / 回滚都是 409，而不是静默覆盖编排。"""
    video, subtitles = await make_video(db_session)
    assert (await save_draft(client, admin_headers, video, draft_payload(subtitles))).status_code == 200
    published = await publish(client, admin_headers, video, expected_revision=1)
    assert published.status_code == 200, published.text
    revision_id = published.json()["revision_id"]

    layout = {
        "lead": {"content_revision_id": revision_id},
        "secondary": [],
        "expression": None,
        "scenarios": [],
    }
    saved = await save_layout(client, admin_headers, layout, expected_revision=0)
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1

    stale_save = await save_layout(client, admin_headers, layout, expected_revision=0)
    assert stale_save.status_code == 409
    assert stale_save.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT

    stale_publish = await client.post(f"{ADMIN}/layout/publish", headers=admin_headers, json={"expected_revision": 0})
    assert stale_publish.status_code == 409
    assert stale_publish.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT

    stale_rollback = await client.post(f"{ADMIN}/layout/rollback", headers=admin_headers, json={"expected_revision": 0})
    assert stale_rollback.status_code == 409
    assert stale_rollback.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT

    # 线上编排没被这些过期请求改动。
    state = await layout_state(client, admin_headers)
    assert state["published_layout"] is None
    assert state["revision"] == 1


@pytest.mark.asyncio
async def test_layout_save_conflicts_when_another_admin_saved_first(client, admin_headers, db_session, monkeypatch):
    """保存编排期间别人先改了编排 → 409（后到的那笔不覆盖对方的编排）。"""
    video, subtitles = await make_video(db_session)
    assert (await save_draft(client, admin_headers, video, draft_payload(subtitles))).status_code == 200
    published = await publish(client, admin_headers, video, expected_revision=1)
    revision_id = published.json()["revision_id"]
    layout = {
        "lead": {"content_revision_id": revision_id},
        "secondary": [],
        "expression": None,
        "scenarios": [],
    }
    saved = await save_layout(client, admin_headers, layout, expected_revision=0)
    assert saved.status_code == 200, saved.text
    current_revision = saved.json()["revision"]

    original = home_content_service._get_or_create_config

    async def _hook(db):
        config = await original(db)
        await bump_layout_revision_in_other_session()
        return config

    monkeypatch.setattr(home_content_service, "_get_or_create_config", _hook)

    response = await save_layout(client, admin_headers, layout, expected_revision=current_revision)
    assert response.status_code == 409
    assert response.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT


@pytest.mark.asyncio
async def test_publish_layout_conflicts_when_layout_changed_concurrently(
    client, admin_headers, db_session, monkeypatch
):
    """发布编排期间别人改了编排 → 409，线上编排不动。"""
    video, subtitles = await make_video(db_session)
    assert (await save_draft(client, admin_headers, video, draft_payload(subtitles))).status_code == 200
    published = await publish(client, admin_headers, video, expected_revision=1)
    revision_id = published.json()["revision_id"]
    layout = {
        "lead": {"content_revision_id": revision_id},
        "secondary": [],
        "expression": None,
        "scenarios": [],
    }
    saved = await save_layout(client, admin_headers, layout, expected_revision=0)
    assert saved.status_code == 200, saved.text
    current_revision = saved.json()["revision"]

    original = home_content_service._validate_layout
    fired = {"n": 0}

    async def _hook(db, placement):
        fired["n"] += 1
        if fired["n"] == 1:
            await bump_layout_revision_in_other_session()
        return await original(db, placement)

    monkeypatch.setattr(home_content_service, "_validate_layout", _hook)

    response = await client.post(
        f"{ADMIN}/layout/publish", headers=admin_headers, json={"expected_revision": current_revision}
    )
    assert response.status_code == 409
    assert response.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT

    state = await layout_state(client, admin_headers)
    assert state["published_layout"] is None


@pytest.mark.asyncio
async def test_publish_and_place_conflicts_when_layout_changed_concurrently(
    client, admin_headers, db_session, monkeypatch
):
    """G4A：「发布并替换主推」期间编排被别人改过 → 整笔拒绝。

    ``_place_content`` 会同时改 ``published_layout`` 与 ``draft_layout``，所以它
    必须和 ``publish_layout`` 一样校验编排的 revision：编排变了就 409，而不是
    静默覆盖别人（还没发布的）编排草稿。
    """
    video, subtitles = await make_video(db_session)
    assert (await save_draft(client, admin_headers, video, draft_payload(subtitles))).status_code == 200
    # 先有一份编排草稿（config.revision=1）。
    saved = await save_layout(
        client,
        admin_headers,
        {"lead": None, "secondary": [], "expression": None, "scenarios": []},
        expected_revision=0,
    )
    assert saved.status_code == 200, saved.text

    original = home_content_service._is_publicly_visible
    fired = {"n": 0}

    async def _hook(db, video_id):
        visible = await original(db, video_id)
        fired["n"] += 1
        if fired["n"] == 1:
            await bump_layout_revision_in_other_session()
        return visible

    monkeypatch.setattr(home_content_service, "_is_publicly_visible", _hook)

    response = await publish(client, admin_headers, video, expected_revision=1, place="lead")
    assert response.status_code == 409, response.text
    assert response.json()["code"] == ErrorCode.HOME_CONTENT_REVISION_CONFLICT

    # 整笔发布被回滚：没有留下已发布版本，线上编排也没变。
    assert await revision_versions(db_session) == []
    state = await layout_state(client, admin_headers)
    assert state["published_layout"] is None
    assert state["draft_layout"]["lead"] is None
