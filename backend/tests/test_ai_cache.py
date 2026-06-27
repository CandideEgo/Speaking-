"""Tests for the AIService caching layer (Redis-backed).

Verifies that the ``await get_redis()`` bug (which silently swallowed a
TypeError and never cached) is fixed: a second call for the same word should
hit the cache and NOT call the LLM again.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai_service import AIService


@pytest.mark.asyncio
async def test_enrich_caches_result_and_skips_llm_on_second_call(fake_redis):
    """First call hits the LLM and caches; second call reads from cache (no LLM)."""
    service = AIService()

    # First call: _chat returns the JSON payload; it gets cached.
    chat_mock = AsyncMock(
        return_value='{"definition":"cached-def","translation":"cached-trans","part_of_speech":"noun","ipa":"/wɜːrd/","example_sentences":["ex1"],"collocations":["col1"],"difficulty_level":"B1"}'
    )
    with patch.object(service, "_chat", new=chat_mock):
        result1 = await service.enrich_vocabulary_word("hello", "hello world")

    assert result1["definition"] == "cached-def"
    # The LLM was called exactly once for the first enrichment.
    assert chat_mock.call_count == 1
    # Something was written under an ai_cache: key
    keys = list(fake_redis._store.keys())
    assert any(k.startswith("ai_cache:") for k in keys)

    # Second call: must NOT call _chat again — served from cache.
    chat_mock2 = AsyncMock()
    with patch.object(service, "_chat", new=chat_mock2):
        result2 = await service.enrich_vocabulary_word("hello", "different context")

    assert chat_mock2.call_count == 0
    assert result2 == result1


@pytest.mark.asyncio
async def test_enrich_raises_when_llm_fails(fake_redis):
    """If the LLM raises, enrich propagates AIServiceError instead of silently
    persisting an empty-default dict (the old behavior masked real failures)."""
    from app.services.ai_service import AIServiceError

    service = AIService()

    with patch.object(service, "_chat", new=AsyncMock(side_effect=AIServiceError("boom"))):
        with pytest.raises(AIServiceError):
            await service.enrich_vocabulary_word("brokenword")
