"""Tests for TranslationService — dual-engine concurrent mode, null
normalization, and the sequential fallback path.

These cover the fixes for the "some subtitles translated, some not" symptom:
- concurrent fan-out (first valid engine wins, sibling cancelled)
- null/empty/non-string entries in an otherwise-valid JSON array become None
  instead of misaligning the write-back
- sequential primary→fallback still works when concurrent mode is disabled
"""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture
def translation_service(fake_redis, monkeypatch):
    """A TranslationService wired to qwen + hy_mt2 with concurrent mode on.

    Settings are monkeypatched on the cached ``get_settings()`` instance so a
    local ``.env`` (e.g. ``TRANSLATION_ENGINE=agnes``) can't make the tests
    non-deterministic.
    """
    from app.core.config import get_settings
    from app.services.translation import TranslationService

    s = get_settings()
    monkeypatch.setattr(s, "translation_engine", "qwen")
    monkeypatch.setattr(s, "translation_fallback_engine", "hy_mt2")
    monkeypatch.setattr(s, "translation_concurrent", True)
    monkeypatch.setattr(s, "translation_qwen_api_key", "test-key")
    monkeypatch.setattr(s, "translation_hymt2_api_key", "test-key")
    return TranslationService()


@pytest.mark.asyncio
async def test_normalize_translations_coerces_junk():
    from app.services.translation import TranslationService

    assert TranslationService._normalize_translations(["a", "b", "c"]) == ["a", "b", "c"]
    # null / non-string / whitespace → None (so write-back skips that slot)
    assert TranslationService._normalize_translations(["a", None, "  ", 5, "b"]) == [
        "a",
        None,
        None,
        None,
        "b",
    ]
    # surrounding whitespace stripped
    assert TranslationService._normalize_translations(["  hi  "]) == ["hi"]


@pytest.mark.asyncio
async def test_translate_batch_concurrent_fans_out(translation_service):
    """In concurrent mode both engines are attempted; a valid result from
    either wins. A failing engine never blocks the batch."""
    service = translation_service
    assert service._concurrent is True
    assert service._fallback is not None

    qwen_mock = AsyncMock(return_value=["你好", "世界"])
    hy_mock = AsyncMock(return_value=["你好(hy)", "世界(hy)"])

    # _call_engine is called with (client, engine, texts); route by engine name
    async def fake_call_engine(client, engine, texts):
        if engine.name == "qwen":
            return await qwen_mock(client, engine, texts)
        return await hy_mock(client, engine, texts)

    with patch.object(service, "_call_engine", side_effect=fake_call_engine):
        result = await service.translate_batch(["hello", "world"])

    assert result in (["你好", "世界"], ["你好(hy)", "世界(hy)"])
    # Both engines were attempted concurrently (concurrent mode fans out)
    assert qwen_mock.called and hy_mock.called


@pytest.mark.asyncio
async def test_translate_batch_concurrent_all_fail_returns_none(translation_service):
    """When every engine fails, the caller gets [None]*n — never a short list
    that would misalign the write-back."""
    service = translation_service
    with patch.object(service, "_call_engine", AsyncMock(return_value=None)):
        result = await service.translate_batch(["a", "b", "c"])
    assert result == [None, None, None]


@pytest.mark.asyncio
async def test_translate_batch_concurrent_partial_nulls_preserved(translation_service):
    """A valid-length array with some null slots is returned with None in those
    slots (normalized), not treated as a failure."""
    service = translation_service
    with patch.object(
        service,
        "_call_engine",
        AsyncMock(return_value=["一", None, "三"]),
    ):
        result = await service.translate_batch(["one", "two", "three"])
    assert result == ["一", None, "三"]


@pytest.mark.asyncio
async def test_translate_batch_sequential_primary_then_fallback(translation_service, monkeypatch):
    """With concurrent mode off, primary is tried first; only on its failure
    does the fallback run."""
    service = translation_service
    monkeypatch.setattr(service, "_concurrent", False)

    primary_mock = AsyncMock(return_value=None)  # primary fails
    fallback_mock = AsyncMock(return_value=["你好"])

    async def fake_call_engine(client, engine, texts):
        if engine.name == service._engine.name:
            return await primary_mock(client, engine, texts)
        return await fallback_mock(client, engine, texts)

    with patch.object(service, "_call_engine", side_effect=fake_call_engine):
        result = await service.translate_batch(["hello"])

    assert result == ["你好"]
    primary_mock.assert_awaited_once()
    fallback_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_translate_batch_empty_input(translation_service):
    assert await translation_service.translate_batch([]) == []
