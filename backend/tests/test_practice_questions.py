"""Tests for the practice-mode AI methods and endpoints."""

from unittest.mock import AsyncMock, patch

import pytest

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
