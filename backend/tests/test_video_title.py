"""Tests for the Chinese display title helper (services/video_title).

The helper is called from inside the translating pipeline step, so its contract
is mostly about what it does *not* do: it never raises, never returns an empty
string, and never asks an engine to translate a title that is already Chinese.
"""

from unittest.mock import AsyncMock

import pytest

from app.services import video_title


def test_normalize_collapses_whitespace():
    assert video_title.normalize_title_zh("  How   to  listen  ") == "How to listen"


def test_normalize_empty_or_missing_becomes_none():
    assert video_title.normalize_title_zh("") is None
    assert video_title.normalize_title_zh("   \n\t ") is None
    assert video_title.normalize_title_zh(None) is None


def test_normalize_truncates_to_column_width():
    assert len(video_title.normalize_title_zh("x" * 900)) == video_title.TITLE_ZH_MAX


@pytest.mark.asyncio
async def test_chinese_title_is_its_own_translation(monkeypatch):
    """A Chinese title must not hit an engine — and it must still be returned,
    so the backfill script stops selecting the row on every run."""
    get_service = AsyncMock(side_effect=AssertionError("engine should not be called"))
    monkeypatch.setattr("app.services.translation.get_translation_service", get_service)

    assert await video_title.translate_video_title("如何成为好的倾听者") == "如何成为好的倾听者"
    get_service.assert_not_called()


@pytest.mark.asyncio
async def test_translates_english_title(monkeypatch):
    service = AsyncMock()
    service.translate_batch = AsyncMock(return_value=["如何成为好的倾听者"])

    def _get_service():
        return service

    monkeypatch.setattr("app.services.translation.get_translation_service", _get_service)

    assert await video_title.translate_video_title("How to Be a Good Listener") == "如何成为好的倾听者"
    service.translate_batch.assert_awaited_once_with(["How to Be a Good Listener"])


@pytest.mark.asyncio
async def test_identical_translation_falls_back_to_source(monkeypatch):
    """An engine that echoes the source still converges the backfill."""
    service = AsyncMock()
    service.translate_batch = AsyncMock(return_value=["TED Talks"])

    monkeypatch.setattr("app.services.translation.get_translation_service", lambda: service)

    assert await video_title.translate_video_title("TED Talks") == "TED Talks"


@pytest.mark.asyncio
async def test_empty_translation_returns_none(monkeypatch):
    service = AsyncMock()
    service.translate_batch = AsyncMock(return_value=[None])

    monkeypatch.setattr("app.services.translation.get_translation_service", lambda: service)

    assert await video_title.translate_video_title("How to Listen") is None


@pytest.mark.asyncio
async def test_engine_failure_is_swallowed(monkeypatch):
    """A broken engine is cosmetic: the pipeline must not see an exception."""

    def _raise():
        raise RuntimeError("engine down")

    monkeypatch.setattr("app.services.translation.get_translation_service", _raise)

    assert await video_title.translate_video_title("How to Listen") is None


@pytest.mark.asyncio
async def test_engine_override_builds_a_dedicated_service(monkeypatch):
    """Admin re-translate passes an engine name; that path bypasses the singleton."""
    service = AsyncMock()
    service.translate_batch = AsyncMock(return_value=["你好"])

    def _get_service():
        raise AssertionError("singleton should not be used when an engine is given")

    monkeypatch.setattr("app.services.translation.get_translation_service", _get_service)
    monkeypatch.setattr("app.services.translation.TranslationService", lambda engine_override: service)

    assert await video_title.translate_video_title("hello", engine="glm") == "你好"
    service.translate_batch.assert_awaited_once_with(["hello"])
