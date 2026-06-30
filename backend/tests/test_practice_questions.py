"""Tests for the practice-mode AI methods and endpoints."""

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


# --- AIService.grade_answer ---


@pytest.mark.asyncio
async def test_grade_fill_blank_lenient_local_match(fake_redis):
    """Fill-in-the-blank with the lemma/inflection is graded locally — no AI call."""
    from unittest.mock import patch

    from app.services.ai_service import AIService

    service = AIService()
    question = {"type": "fill_blank", "question": "She ___ a company.", "answer": "run"}
    chat_mock = AsyncMock()
    with patch.object(service, "_chat", new=chat_mock):
        result = await service.grade_answer(question, "runs")
    assert result["correct"] is True
    chat_mock.assert_not_called()  # local match, no LLM


@pytest.mark.asyncio
async def test_grade_fill_blank_wrong_falls_to_ai(fake_redis):
    """Fill-in-the-blank miss with no options falls through to open-ended AI grading."""
    from unittest.mock import patch

    from app.services.ai_service import AIService

    service = AIService()
    question = {"type": "fill_blank", "question": "She ___ a company.", "answer": "run"}
    ai_return = '{"correct": false, "explanation": "应为 run"}'
    with patch.object(service, "_chat", new=AsyncMock(return_value=ai_return)):
        result = await service.grade_answer(question, "totally wrong")
    assert result["correct"] is False
    assert "run" in result["explanation"]


@pytest.mark.asyncio
async def test_grade_multiple_choice_exact_match(fake_redis):
    from unittest.mock import patch

    from app.services.ai_service import AIService

    service = AIService()
    question = {"type": "qa", "question": "Q?", "answer": "B", "options": ["A", "B", "C", "D"]}
    chat_mock = AsyncMock()
    with patch.object(service, "_chat", new=chat_mock):
        result = await service.grade_answer(question, "b")
    assert result["correct"] is True
    chat_mock.assert_not_called()


@pytest.mark.asyncio
async def test_grade_open_ended_calls_ai(fake_redis):
    from unittest.mock import patch

    from app.services.ai_service import AIService

    service = AIService()
    question = {"type": "qa", "question": "What is the talk about?", "answer": "关于创业"}
    ai_return = '{"correct": true, "explanation": "语义正确"}'
    with patch.object(service, "_chat", new=AsyncMock(return_value=ai_return)):
        result = await service.grade_answer(question, "entrepreneurship")
    assert result["correct"] is True
    assert result["explanation"] == "语义正确"


@pytest.mark.asyncio
async def test_grade_sentence_building_local_match(fake_redis):
    """sentence_building is graded locally by normalized token order — no AI."""
    from unittest.mock import patch

    from app.services.ai_service import AIService

    service = AIService()
    question = {
        "type": "sentence_building",
        "question": "用这些词造句",
        "answer": "She runs a company.",
        "tokens": ["company", "a", "runs", "She"],
    }
    chat_mock = AsyncMock()
    with patch.object(service, "_chat", new=chat_mock):
        result = await service.grade_answer(question, "she runs a company")
    assert result["correct"] is True
    chat_mock.assert_not_called()


@pytest.mark.asyncio
async def test_grade_sentence_building_wrong_order(fake_redis):
    from app.services.ai_service import AIService

    service = AIService()
    question = {
        "type": "sentence_building",
        "answer": "She runs a company.",
        "tokens": ["company", "a", "runs", "She"],
    }
    result = await service.grade_answer(question, "a company runs she")
    assert result["correct"] is False


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
async def test_get_practice_requires_pro(client, auth_headers):
    """Free user (auth_headers) is not pro -> 403."""
    resp = await client.get(
        "/api/v1/videos/some-video/practice",
        params={"level": "cet4"},
        headers=auth_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_practice_rejects_invalid_level(client, admin_headers):
    # admin_headers is pro; invalid level -> 422
    resp = await client.get(
        "/api/v1/videos/some-video/practice",
        params={"level": "not-real"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_practice_caches_after_generation(client, admin_headers, monkeypatch):
    """First call generates + caches; second call returns the cache without AI."""
    from app.api.v1 import practice as practice_mod
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoStatus
    from app.services import ecdict
    from tests.conftest import TestSessionLocal

    # A subtitle with a target-level word.
    monkeypatch.setattr(
        ecdict,
        "lookup",
        lambda token: {"lemma": "run", "translation": "跑"} if token.lower() in ("run", "runs") else None,
    )

    # Seed a real ready video + subtitle owned by the admin user.
    async with TestSessionLocal() as db:
        vid = "vid-practice-test"
        db.add(Video(id=vid, title="t", source_url="x", status=VideoStatus.ready))
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

    canned = [{"type": "qa", "question": "Q?", "answer": "A", "options": None, "cet_words": []}]
    gen_mock = AsyncMock(return_value=canned)
    monkeypatch.setattr(
        practice_mod,
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
    assert len(body1["questions"]) == 1
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


@pytest.mark.asyncio
async def test_grade_endpoint(client, admin_headers, monkeypatch):
    from app.api.v1 import practice as practice_mod

    async def _fake_get_ready(db, vid):
        return object()

    monkeypatch.setattr(practice_mod, "_get_ready_video_or_404", _fake_get_ready)
    grade_mock = AsyncMock(return_value={"correct": True, "explanation": "对"})
    monkeypatch.setattr(practice_mod, "get_ai_service", lambda: type("FakeAI", (), {"grade_answer": grade_mock})())

    resp = await client.post(
        "/api/v1/videos/vid/practice/grade",
        headers=admin_headers,
        json={
            "question": {"type": "qa", "question": "Q?", "answer": "A"},
            "user_answer": "something",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["correct"] is True


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
        owner = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
        v = await _seed_own_ready_video(db, owner.id)
        vid = v.id
        # seed an existing cached set
        db.add(
            VideoPracticeQuestion(
                video_id=vid,
                exam_level="cet4",
                questions=[{"type": "qa", "question": "old", "answer": "A"}],
                question_count=1,
            )
        )
        await db.commit()

    new_questions = [
        {"type": "qa", "question": "New Q?", "answer": "New A", "options": None, "cet_words": []},
        {"type": "fill_blank", "question": "She ___.", "answer": "runs", "options": ["runs"], "cet_words": ["runs"]},
    ]
    resp = await client.patch(
        f"/api/v1/videos/{vid}/practice",
        params={"level": "cet4"},
        headers=auth_headers,
        json={"questions": new_questions},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["questions"]) == 2
    assert data["questions"][0]["question"] == "New Q?"

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
        owner = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
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
        owner = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
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
            email="other-prac@example.com",
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
    from app.api.v1 import practice as practice_mod
    from app.models.subtitle import Subtitle
    from app.services import ecdict
    from tests.conftest import TestSessionLocal

    monkeypatch.setattr(
        ecdict,
        "lookup",
        lambda token: {"lemma": "run", "translation": "跑"} if token.lower() in ("run", "runs") else None,
    )
    canned = [{"type": "qa", "question": "Fresh Q?", "answer": "A", "options": None, "cet_words": []}]
    gen_mock = AsyncMock(return_value=canned)
    monkeypatch.setattr(
        practice_mod,
        "get_ai_service",
        lambda: type("FakeAI", (), {"generate_practice_questions": gen_mock})(),
    )

    async with TestSessionLocal() as db:
        from app.models.user import User

        owner = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
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
    assert resp.json()["questions"][0]["question"] == "Fresh Q?"
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
        owner = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
        v = await _seed_own_ready_video(db, owner.id, review=VideoReviewStatus.pending_review)
        # live draft (what owner is editing)
        db.add(
            VideoPracticeQuestion(
                video_id=v.id,
                exam_level="cet4",
                questions=[{"type": "qa", "question": "LIVE DRAFT", "answer": "A"}],
                question_count=1,
            )
        )
        # frozen approved snapshot has the older public question
        v.published_snapshot = {
            "version": 1,
            "subtitles": [],
            "practice": {
                "cet4": [{"type": "qa", "question": "APPROVED PUBLIC", "answer": "A", "options": None, "cet_words": []}]
            },
        }
        await db.commit()
        vid = v.id

    # Admin (a non-owner pro viewer) fetches practice → sees the snapshot.
    resp = await client.get(f"/api/v1/videos/{vid}/practice", params={"level": "cet4"}, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["questions"][0]["question"] == "APPROVED PUBLIC"


# --- vocabulary drill (Phase 4) ---


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
        owner = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
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
    resp = await client.get(f"/api/v1/videos/{vid}/vocabulary-drill", params={"level": "cet4"}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["exam_level"] == "cet4"
    items = data["items"]
    # At least one spelling item for "runs".
    spelling = [i for i in items if i["kind"] == "spelling"]
    assert spelling and spelling[0]["word"] == "runs"
    assert spelling[0]["answer"] == "runs"


@pytest.mark.asyncio
async def test_vocabulary_drill_no_target_words(client, auth_headers):
    """A video with no target-level words returns 409."""
    from app.models.subtitle import Subtitle
    from app.models.user import User
    from app.models.video import Video, VideoReviewStatus, VideoStatus
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "test@example.com"))).scalar_one()
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

    resp = await client.get(f"/api/v1/videos/{vid}/vocabulary-drill", params={"level": "cet4"}, headers=auth_headers)
    assert resp.status_code == 409
