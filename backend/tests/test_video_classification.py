"""Tests for LLM video content classification (services/video_classification)."""

import pytest

from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus
from app.services.video_classification import (
    VideoClassificationError,
    build_classification_prompt,
    classify_video_metadata,
    validate_cefr,
    validate_topics,
)
from tests.conftest import TestSessionLocal


class TestValidateTopics:
    def test_keeps_whitelisted_lowercased_deduped(self):
        assert validate_topics(["TED", "tech", "ted", "unknown", "speech"]) == [
            "ted",
            "tech",
            "speech",
        ]

    def test_caps_at_three(self):
        raw = ["ted", "interview", "news", "vlog", "tech"]
        assert validate_topics(raw) == ["ted", "interview", "news"]

    def test_all_is_not_a_valid_tag(self):
        # "all" is a filter pseudo-category, never a stored tag.
        with pytest.raises(VideoClassificationError):
            validate_topics(["all"])

    def test_raises_when_nothing_valid(self):
        with pytest.raises(VideoClassificationError):
            validate_topics(["sports", "cooking"])
        with pytest.raises(VideoClassificationError):
            validate_topics([])
        with pytest.raises(VideoClassificationError):
            validate_topics("not-a-list")


class TestValidateCefr:
    def test_normalizes_case(self):
        assert validate_cefr("b2") == "B2"
        assert validate_cefr(" C1 ") == "C1"

    def test_invalid_becomes_none(self):
        assert validate_cefr("CR") is None
        assert validate_cefr("B3") is None
        assert validate_cefr("") is None
        assert validate_cefr(None) is None
        assert validate_cefr(3) is None


class TestBuildPrompt:
    def test_includes_title_description_and_whitelist(self):
        system, user = build_classification_prompt("A talk", "Some description", "Hello world.")
        assert '"topics"' in system and '"difficulty"' in system
        for cid in ("ted", "interview", "news", "vlog", "educational", "movie", "tech", "speech"):
            assert cid in system
        assert "A talk" in user
        assert "Some description" in user
        assert "Hello world." in user

    def test_omits_empty_description(self):
        _, user = build_classification_prompt("A talk", None, "Hello.")
        assert "Description:" not in user


def _fake_ai(monkeypatch, payload):
    """Patch get_ai_service to return an object yielding ``payload`` from chat_json."""
    calls = []

    class _FakeAI:
        async def chat_json(self, system, user, temperature=0.3):
            calls.append({"system": system, "user": user})
            return payload

    monkeypatch.setattr("app.services.video_classification.get_ai_service", lambda: _FakeAI())
    return calls


async def _seed_video(video_id: str, **kwargs) -> None:
    async with TestSessionLocal() as db:
        db.add(
            Video(
                id=video_id,
                title="Test talk",
                source_url="https://youtube.com/watch?v=x",
                status=VideoStatus.ready,
                **kwargs,
            )
        )
        db.add(
            Subtitle(
                video_id=video_id,
                start_time=0.0,
                end_time=2.0,
                text_en="Hello world, this is a test transcript.",
                sentence_index=0,
            )
        )
        await db.commit()


class TestClassifyVideoMetadata:
    async def test_writes_topics_and_fills_null_difficulty(self, monkeypatch):
        _fake_ai(monkeypatch, {"topics": ["TED", "speech"], "difficulty": "b2"})
        await _seed_video("vc1")

        async with TestSessionLocal() as db:
            assert await classify_video_metadata(db, "vc1") is True

        async with TestSessionLocal() as db:
            video = await db.get(Video, "vc1")
            assert video.topic_tags == "ted,speech"
            assert video.difficulty_level == "B2"

    async def test_never_overwrites_existing_difficulty(self, monkeypatch):
        _fake_ai(monkeypatch, {"topics": ["tech"], "difficulty": "C1"})
        await _seed_video("vc2", difficulty_level="B2")

        async with TestSessionLocal() as db:
            assert await classify_video_metadata(db, "vc2") is True

        async with TestSessionLocal() as db:
            video = await db.get(Video, "vc2")
            assert video.topic_tags == "tech"
            assert video.difficulty_level == "B2"

    async def test_skips_when_topic_tags_already_set(self, monkeypatch):
        calls = _fake_ai(monkeypatch, {"topics": ["news"], "difficulty": "A2"})
        await _seed_video("vc3", topic_tags="movie")

        async with TestSessionLocal() as db:
            assert await classify_video_metadata(db, "vc3") is False
        assert calls == []

    async def test_propagates_invalid_llm_output(self, monkeypatch):
        _fake_ai(monkeypatch, {"topics": ["sports"], "difficulty": "B2"})
        await _seed_video("vc4")

        async with TestSessionLocal() as db:
            with pytest.raises(VideoClassificationError):
                await classify_video_metadata(db, "vc4")

        async with TestSessionLocal() as db:
            video = await db.get(Video, "vc4")
            assert video.topic_tags is None
            assert video.difficulty_level is None

    async def test_raises_for_missing_video(self, monkeypatch):
        _fake_ai(monkeypatch, {"topics": ["news"], "difficulty": "B1"})
        async with TestSessionLocal() as db:
            with pytest.raises(VideoClassificationError):
                await classify_video_metadata(db, "no-such-video")
