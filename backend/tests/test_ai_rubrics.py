"""Tests for the AI API (/api/v1/ai).

The AI service is mocked so no real LLM calls are made. (Rubrics API tests
were removed when AI speaking scoring was cut — ADR-0002, 2026-07.)
"""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient


def _mock_ai_service():
    """Return a mock AIService with async methods pre-stubbed."""
    m = AsyncMock()
    m.word_context_meaning.return_value = "/həˈloʊ/ — 你好 (greeting)"
    m.assistant_daily_summary.return_value = "You practiced 3 attempts today. Keep it up!"
    m.assistant_recommend.return_value = "Try a TED talk on technology."
    return m


class TestAIWordLookup:
    async def test_requires_pro(self, client: AsyncClient, auth_headers: dict):
        # free user → 403 from require_pro_user
        resp = await client.post(
            "/api/v1/ai/word-lookup?word=hello&sentence=hello world",
            headers=auth_headers,
        )
        assert resp.status_code == 403

    async def test_pro_user_gets_meaning(self, client: AsyncClient, pro_headers: dict):
        with patch("app.api.v1.ai.get_ai_service", return_value=_mock_ai_service()):
            resp = await client.post(
                "/api/v1/ai/word-lookup?word=hello&sentence=hello world",
                headers=pro_headers,
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["word"] == "hello"
        assert "meaning" in data


class TestAIAssistantSummary:
    async def test_requires_pro(self, client: AsyncClient, auth_headers: dict):
        assert (await client.get("/api/v1/ai/assistant/summary", headers=auth_headers)).status_code == 403

    async def test_pro_user_gets_summary(self, client: AsyncClient, pro_headers: dict):
        with patch("app.api.v1.ai.get_ai_service", return_value=_mock_ai_service()):
            resp = await client.get("/api/v1/ai/assistant/summary", headers=pro_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "summary" in data
        assert "stats" in data
        # current_level is nested inside stats
        assert data["stats"]["current_level"] is not None


class TestAIAssistantRecommend:
    async def test_requires_pro(self, client: AsyncClient, auth_headers: dict):
        assert (await client.get("/api/v1/ai/assistant/recommend", headers=auth_headers)).status_code == 403

    async def test_pro_user_gets_recommendation(self, client: AsyncClient, pro_headers: dict):
        with patch("app.api.v1.ai.get_ai_service", return_value=_mock_ai_service()):
            resp = await client.get("/api/v1/ai/assistant/recommend", headers=pro_headers)
        assert "recommendation" in resp.json()
