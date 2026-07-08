"""Tests for the practice-mode AI methods and endpoints.

Grading is client-side; the server only generates items and accepts SM-2
submissions.  The old ``grade_answer`` / ``/practice/grade`` endpoint has been
removed — those tests are deleted.
"""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

# --- AIService.generate_practice_questions ---


@pytest.mark.asyncio
async def test_generate_practice_questions_normalizes_questions(fake_redis):
    from app.services.ai_service import AIService

    service = AIService()
    raw = (
        '{"questions": ['
        '{"type":"qa","question":"What is the talk about?","answer":"关于创业","options":null,"cet_words":null},'
        '{"type":"fill_blank","question":"She ___ a company.","answer":"run","options":["run","runs","ran","running"],"cet_words":["run"]},'
        '{"question":"   "}'  # malformed: empty question -> filtered out
        "]}"
    )
    with patch.object(service, "_chat", new=AsyncMock(return_value=raw)):
        questions = await service.generate_practice_questions(
            "She runs a company.", [{"word": "run", "translation": "经营"}], "cet4", 2
        )
    assert len(questions) == 2
    assert questions[0]["type"] == "qa"
    assert questions[0]["answer"] == "关于创业"
    # normalized: missing fields filled
    assert questions[0]["cet_words"] == []
    assert questions[0]["options"] is None
    assert questions[1]["type"] == "fill_blank"
    assert questions[1]["cet_words"] == ["run"]


@pytest.mark.asyncio
async def test_generate_practice_questions_empty_transcript_returns_empty(fake_redis):
    from app.services.ai_service import AIService

    service = AIService()
    questions = await service.generate_practice_questions("", [], "cet4", 5)
    assert questions == []


@pytest.mark.asyncio
async def test_generate_practice_questions_accepts_raw_list(fake_redis):
    from unittest.mock import patch

    from app.services.ai_service import AIService

    service = AIService()
    raw = '[{"type":"qa","question":"Q?","answer":"A"}]'
    with patch.object(service, "_chat", new=AsyncMock(return_value=raw)):
        questions = await service.generate_practice_questions("transcript here", [], "cet6", 1)
    assert len(questions) == 1
    assert questions[0]["question"] == "Q?"


@pytest.mark.asyncio
async def test_generate_practice_questions_preserves_reading_fields(fake_redis):
    """Reading/sentence_building questions carry passage/tokens through normalization."""
    from app.services.ai_service import AIService

    service = AIService()
    raw = (
        '{"questions": ['
        '{"type":"reading","question":"What is the passage about?","answer":"创业","passage":"She started a small company."},'
        '{"type":"sentence_building","question":"造句","answer":"She runs a company.","tokens":["company","a","runs","She"]}'
        "]}"
    )
    with patch.object(service, "_chat", new=AsyncMock(return_value=raw)):
        questions = await service.generate_practice_questions(
            "She runs a company.", [{"word": "run", "translation": "经营"}], "cet4", 2
        )
    assert len(questions) == 2
    reading = next(q for q in questions if q["type"] == "reading")
    assert reading["passage"] == "She started a small company."
    sb = next(q for q in questions if q["type"] == "sentence_building")
    assert sb["tokens"] == ["company", "a", "runs", "She"]


# --- endpoints ---


@pytest.mark.asyncio
async def test_get_practice_free_user_allowed(client, auth_headers):
    """Practice is free-tier (not Pro-gated). A non-existent video returns 404."""
    resp = await client.get(
        "/api/v1/videos/nonexistent-video/practice",
        params={"level": "cet4"},
        headers=auth_headers,
    )
    # Video doesn't exist → 404 (not 403 Pro-gate).
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_practice_rejects_invalid_level(client, admin_headers):
    # invalid level -> 422
    resp = await client.get(
        "/api/v1/videos/some-video/practice",
        params={"level": "not-real"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_practice_new_word_returns_recognition(client, admin_headers, monkeypatch):
    """A new word (no vocabulary record) returns a recognition-type item — no AI needed."""
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoStatus
    from app.services import ecdict
    from tests.conftest import TestSessionLocal

    monkeypatch.setattr(
        ecdict,
        "lookup",
        lambda token: {"lemma": "run", "translation": "跑"} if token.lower() in ("run", "runs") else None,
    )

    async with TestSessionLocal() as db:
        vid = "vid-practice-new"
        db.add(Video(id=vid, title="t", source_url="x", status=VideoStatus.ready, is_official=True, is_published=True))
        db.add(
            Subtitle(
                id="s1",
                video_id=vid,
                start_time=0,
                end_time=1,
                text_en="She runs a company.",
                sentence_index=0,
                word_levels={"runs": ["cet4", "cet6"]},
            )
        )
        await db.commit()

    resp = await client.get(
        f"/api/v1/videos/{vid}/practice",
        params={"level": "cet4"},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["exam_level"] == "cet4"
    items = body["items"]
    assert len(items) >= 1
    # New word → recognition category
    runs_items = [i for i in items if i["word"] == "runs"]
    assert runs_items
    assert runs_items[0]["category"] == "recognition"
    assert runs_items[0]["type"] in ("listen_choose_meaning", "see_word_choose_meaning")


@pytest.mark.asyncio
async def test_get_practice_context_fill_caches_after_generation(client, admin_headers, monkeypatch):
    """When a word is in reviewing/mastered state, context_fill is generated via
    AI and cached. Second call returns the cache without AI."""
    from app.models.learning import Vocabulary
    from app.models.subtitle import Subtitle
    from app.models.user import User
    from app.models.video import Video, VideoStatus
    from app.services import ecdict
    from app.services import practice_service as practice_service_mod
    from tests.conftest import TestSessionLocal

    monkeypatch.setattr(
        ecdict,
        "lookup",
        lambda token: {"lemma": "run", "translation": "跑"} if token.lower() in ("run", "runs") else None,
    )

    async with TestSessionLocal() as db:
        vid = "vid-practice-cache"
        db.add(Video(id=vid, title="t", source_url="x", status=VideoStatus.ready, is_official=True, is_published=True))
        db.add(
            Subtitle(
                id="s1",
                video_id=vid,
                start_time=0,
                end_time=1,
                text_en="She runs a company.",
                sentence_index=0,
                word_levels={"runs": ["cet4", "cet6"]},
            )
        )
        # Make "runs" a reviewing word so it gets context_fill (needs AI).
        admin = (await db.execute(select(User).where(User.phone == "13900139000"))).scalar_one()
        db.add(
            Vocabulary(
                user_id=admin.id,
                word="runs",
                translation="跑",
                mastery_level="reviewing",
                review_count=3,
                ease_factor=2.5,
                interval_days=7,
            )
        )
        await db.commit()

    # Mock AI to return context_fill items.
    canned = [
        {
            "type": "context_fill",
            "word": "runs",
            "question": "She ___ a company.",
            "answer": "runs",
            "options": ["runs", "walks", "sits", "stands"],
            "cet_words": ["runs"],
        },
    ]
    gen_mock = AsyncMock(return_value=canned)
    monkeypatch.setattr(
        practice_service_mod,
        "get_ai_service",
        lambda: type("FakeAI", (), {"generate_practice_questions": gen_mock})(),
    )

    resp1 = await client.get(
        f"/api/v1/videos/{vid}/practice",
        params={"level": "cet4"},
        headers=admin_headers,
    )
    assert resp1.status_code == 200, resp1.text
    body1 = resp1.json()
    assert len(body1["items"]) >= 1
    assert gen_mock.await_count == 1

    # Second call: cached, no regeneration.
    resp2 = await client.get(
        f"/api/v1/videos/{vid}/practice",
        params={"level": "cet4"},
        headers=admin_headers,
    )
    assert resp2.status_code == 200
    assert resp2.json() == body1
    assert gen_mock.await_count == 1  # still only one AI call


# --- UGC practice editing (Phase 2B) ---


async def _seed_own_ready_video(db, owner_id, vid="vid-prac-edit", review="draft"):
    from app.models.video import Video, VideoReviewStatus, VideoStatus

    v = Video(
        id=vid,
        title="UGC Prac",
        source_url="x",
        status=VideoStatus.ready,
        is_official=False,
        review_status=review if isinstance(review, str) else review.value,
        user_id=owner_id,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


@pytest.mark.asyncio
async def test_edit_practice_owner_overwrites(client, auth_headers):
    """Owner replaces the cached practice set; not Pro-gated."""
    from sqlalchemy import select

    from app.models.practice import VideoPracticeQuestion
    from app.models.user import User
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
        v = await _seed_own_ready_video(db, owner.id)
        vid = v.id
        # seed an existing cached set
        db.add(
            VideoPracticeQuestion(
                video_id=vid,
                exam_level="cet4",
                questions=[
                    {
                        "word": "run",
                        "type": "context_fill",
                        "question": "She ___ a company.",
                        "answer": "runs",
                        "options": ["runs", "walks", "sits", "stands"],
                    },
                ],
                question_count=1,
            )
        )
        await db.commit()

    # New questions must match ContextFillItem schema (word, type=context_fill, question, answer, options).
    new_questions = [
        {
            "word": "run",
            "type": "context_fill",
            "question": "She ___ fast.",
            "answer": "runs",
            "options": ["runs", "walks"],
        },
        {
            "word": "company",
            "type": "context_fill",
            "question": "She runs a ___.",
            "answer": "company",
            "options": ["company", "business"],
        },
    ]
    resp = await client.patch(
        f"/api/v1/videos/{vid}/practice",
        params={"level": "cet4"},
        headers=auth_headers,
        json={"questions": new_questions},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["items"][0]["sentence_template"] == "She ___ fast."

    # Persisted.
    async with TestSessionLocal() as db:
        row = (
            await db.execute(
                select(VideoPracticeQuestion).where(
                    VideoPracticeQuestion.video_id == vid, VideoPracticeQuestion.exam_level == "cet4"
                )
            )
        ).scalar_one()
        assert row.question_count == 2


@pytest.mark.asyncio
async def test_edit_practice_blocked_when_published(client, auth_headers):
    from app.models.user import User
    from app.models.video import VideoReviewStatus
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
        v = await _seed_own_ready_video(db, owner.id, review=VideoReviewStatus.published)
        vid = v.id

    resp = await client.patch(
        f"/api/v1/videos/{vid}/practice",
        params={"level": "cet4"},
        headers=auth_headers,
        json={"questions": []},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_edit_practice_non_owner_forbidden(client, auth_headers):
    """Non-owner cannot edit another user's practice (404, no leak)."""
    from app.models.user import User
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
        v = await _seed_own_ready_video(db, owner.id)
        vid = v.id

    other_headers = await _make_other_headers()

    resp = await client.patch(
        f"/api/v1/videos/{vid}/practice",
        params={"level": "cet4"},
        headers=other_headers,
        json={"questions": []},
    )
    assert resp.status_code == 404


async def _make_other_headers() -> dict:
    from app.core.security import create_token, hash_password
    from app.models.user import PlanType, RoleType, User
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        user = User(
            phone="13800138006",
            hashed_password=hash_password("Otherpass1!"),
            name="Other",
            plan=PlanType.free,
            role=RoleType.user,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return {"Authorization": f"Bearer {create_token(user.id)}"}


@pytest.mark.asyncio
async def test_regenerate_practice_owner(client, auth_headers, monkeypatch):
    from app.models.subtitle import Subtitle
    from app.services import ecdict
    from app.services import practice_service as practice_service_mod
    from tests.conftest import TestSessionLocal

    monkeypatch.setattr(
        ecdict,
        "lookup",
        lambda token: {"lemma": "run", "translation": "跑"} if token.lower() in ("run", "runs") else None,
    )
    # Mock AI to return context_fill items.
    canned = [
        {
            "type": "context_fill",
            "word": "runs",
            "question": "She ___ a company.",
            "answer": "runs",
            "options": ["runs", "walks", "sits", "stands"],
            "cet_words": ["runs"],
        },
    ]
    gen_mock = AsyncMock(return_value=canned)
    monkeypatch.setattr(
        practice_service_mod,
        "get_ai_service",
        lambda: type("FakeAI", (), {"generate_practice_questions": gen_mock})(),
    )

    async with TestSessionLocal() as db:
        from app.models.user import User

        owner = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
        v = await _seed_own_ready_video(db, owner.id, vid="vid-regen")
        db.add(
            Subtitle(
                id="sr1",
                video_id=v.id,
                start_time=0,
                end_time=1,
                text_en="She runs a company.",
                sentence_index=0,
                word_levels={"runs": ["cet4"]},
            )
        )
        await db.commit()
        vid = v.id

    resp = await client.post(
        f"/api/v1/videos/{vid}/practice/regenerate",
        params={"level": "cet4", "count": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    # Response uses "items" (UnifiedPracticeSet), not "questions".
    items = resp.json()["items"]
    # AI returns context_fill items; regenerate filters to context_fill only.
    assert len(items) >= 1
    assert items[0]["type"] == "context_fill"
    assert gen_mock.await_count == 1


@pytest.mark.asyncio
async def test_public_reads_snapshot_practice_during_rereview(client, auth_headers, admin_headers):
    """During re-review a non-owner reads practice from the frozen snapshot, not
    the owner's live draft. Admin (pro) is used as the public viewer here."""
    from app.models.practice import VideoPracticeQuestion
    from app.models.user import User
    from app.models.video import VideoReviewStatus
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
        v = await _seed_own_ready_video(db, owner.id, review=VideoReviewStatus.pending_review)
        # live draft (what owner is editing)
        db.add(
            VideoPracticeQuestion(
                video_id=v.id,
                exam_level="cet4",
                questions=[
                    {
                        "word": "run",
                        "category": "context",
                        "type": "context_fill",
                        "translation": "跑",
                        "question": "LIVE DRAFT",
                        "answer": "runs",
                        "options": None,
                    },
                ],
                question_count=1,
            )
        )
        # frozen approved snapshot has the older public question
        v.published_snapshot = {
            "version": 1,
            "subtitles": [],
            "practice": {
                "cet4": [
                    {
                        "word": "run",
                        "category": "context",
                        "type": "context_fill",
                        "translation": "跑",
                        "question": "APPROVED PUBLIC",
                        "answer": "runs",
                        "options": None,
                    },
                ],
            },
        }
        await db.commit()
        vid = v.id

    # Admin (a non-owner pro viewer) fetches practice → sees the snapshot.
    resp = await client.get(f"/api/v1/videos/{vid}/practice", params={"level": "cet4"}, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    # Response uses "items" (UnifiedPracticeSet), not "questions".
    assert resp.json()["items"][0]["sentence_template"] == "APPROVED PUBLIC"


# --- vocabulary drill (unified into /practice) ---


@pytest.mark.asyncio
async def test_vocabulary_drill_free_user_allowed(client, auth_headers, monkeypatch):
    """Vocab drill is free-tier (not Pro-gated) and deterministic (no AI)."""
    from app.models.subtitle import Subtitle
    from app.models.user import User
    from app.models.video import Video, VideoReviewStatus, VideoStatus
    from app.services import ecdict
    from tests.conftest import TestSessionLocal

    monkeypatch.setattr(
        ecdict,
        "lookup",
        lambda token: {"lemma": token, "translation": "跑"} if token.lower() == "runs" else None,
    )

    async with TestSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
        v = Video(
            id="vid-vocab-drill",
            title="Vocab Drill",
            source_url="x",
            status=VideoStatus.ready,
            is_official=False,
            review_status=VideoReviewStatus.published.value,
            user_id=owner.id,
        )
        db.add(v)
        db.add(
            Subtitle(
                id="svd1",
                video_id=v.id,
                start_time=0,
                end_time=1,
                text_en="She runs fast.",
                sentence_index=0,
                word_levels={"runs": ["cet4"]},
            )
        )
        await db.commit()
        vid = v.id

    # Free user (auth_headers) can access the drill — not 403.
    # Route is now /practice (unified), not /vocabulary-drill.
    resp = await client.get(f"/api/v1/videos/{vid}/practice", params={"level": "cet4"}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["exam_level"] == "cet4"
    items = data["items"]
    # At least one item for "runs" (type depends on mastery, but word must be present).
    runs_items = [i for i in items if i["word"] == "runs"]
    assert runs_items, f"expected at least one item for 'runs', got items: {items}"


@pytest.mark.asyncio
async def test_vocabulary_drill_no_target_words(client, auth_headers):
    """A video with no target-level words returns 409."""
    from app.models.subtitle import Subtitle
    from app.models.user import User
    from app.models.video import Video, VideoReviewStatus, VideoStatus
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
        v = Video(
            id="vid-vocab-empty",
            title="Empty",
            source_url="x",
            status=VideoStatus.ready,
            is_official=False,
            review_status=VideoReviewStatus.published.value,
            user_id=owner.id,
        )
        db.add(v)
        db.add(
            Subtitle(
                id="sve1",
                video_id=v.id,
                start_time=0,
                end_time=1,
                text_en="Hello world.",
                sentence_index=0,
                word_levels=None,
            )
        )
        await db.commit()
        vid = v.id

    # Route is now /practice (unified), not /vocabulary-drill.
    resp = await client.get(f"/api/v1/videos/{vid}/practice", params={"level": "cet4"}, headers=auth_headers)
    assert resp.status_code == 409
