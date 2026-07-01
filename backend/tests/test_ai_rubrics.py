"""Tests for the AI API (/api/v1/ai) and rubrics API (/api/v1/rubrics).

The AI service is mocked so no real LLM calls are made. Rubrics are pure DB.
"""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.models.rubric import RubricCriterion, SpeakingRubric
from tests.conftest import TestSessionLocal


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
        assert resp.status_code == 200
        assert "recommendation" in resp.json()


# ---------------------------------------------------------------------------
# Rubrics
# ---------------------------------------------------------------------------


class TestListRubrics:
    async def test_list_empty(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/rubrics", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_returns_rubrics(self, client: AsyncClient, auth_headers: dict):
        async with TestSessionLocal() as db:
            r = SpeakingRubric(name="Default", description="d", is_default=True)
            db.add(r)
            await db.flush()
            db.add(RubricCriterion(rubric_id=r.id, name="Accuracy", description="acc", weight=0.5, sort_order=1))
            await db.commit()

        resp = await client.get("/api/v1/rubrics", headers=auth_headers)
        items = resp.json()
        assert len(items) == 1
        assert items[0]["name"] == "Default"
        assert items[0]["is_default"] is True
        assert len(items[0]["criteria"]) == 1

    async def test_get_default_rubric_none(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/rubrics/default", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() is None


class TestCreateRubric:
    async def test_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/rubrics",
            headers=auth_headers,
            json={"name": "X", "description": "d", "criteria": []},
        )
        assert resp.status_code == 403

    async def test_admin_creates_rubric(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post(
            "/api/v1/rubrics",
            headers=admin_headers,
            json={
                "name": "My Rubric",
                "description": "A test rubric",
                "criteria": [
                    {"name": "Pronunciation", "description": "clarity", "weight": 0.6, "sort_order": 1},
                    {"name": "Fluency", "description": "flow", "weight": 0.4, "sort_order": 2},
                ],
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "My Rubric"
        assert len(data["criteria"]) == 2

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/rubrics",
            json={"name": "X", "description": "d", "criteria": []},
        )
        assert resp.status_code == 401


class TestUpdateDeleteRubric:
    async def test_update_rubric(self, client: AsyncClient, admin_headers: dict):
        create = await client.post(
            "/api/v1/rubrics",
            headers=admin_headers,
            json={"name": "Old", "description": "d", "criteria": []},
        )
        rid = create.json()["id"]
        resp = await client.put(
            f"/api/v1/rubrics/{rid}",
            headers=admin_headers,
            json={"name": "New", "criteria": [{"name": "C1", "description": "x", "weight": 1.0, "sort_order": 1}]},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"
        assert len(resp.json()["criteria"]) == 1

    async def test_delete_rubric(self, client: AsyncClient, admin_headers: dict):
        rid = (
            await client.post(
                "/api/v1/rubrics",
                headers=admin_headers,
                json={"name": "ToDelete", "description": "d", "criteria": []},
            )
        ).json()["id"]
        resp = await client.delete(f"/api/v1/rubrics/{rid}", headers=admin_headers)
        assert resp.status_code == 204

    async def test_delete_nonexistent_404(self, client: AsyncClient, admin_headers: dict):
        resp = await client.delete("/api/v1/rubrics/nonexistent", headers=admin_headers)
        assert resp.status_code == 404

    async def test_cannot_delete_default_rubric(self, client: AsyncClient, admin_headers: dict):
        async with TestSessionLocal() as db:
            r = SpeakingRubric(name="Def", description="d", is_default=True)
            db.add(r)
            await db.commit()
            await db.refresh(r)
            rid = r.id
        resp = await client.delete(f"/api/v1/rubrics/{rid}", headers=admin_headers)
        assert resp.status_code == 400


class TestSetDefaultRubric:
    async def test_set_default(self, client: AsyncClient, admin_headers: dict):
        rid = (
            await client.post(
                "/api/v1/rubrics",
                headers=admin_headers,
                json={"name": "ToDefault", "description": "d", "criteria": []},
            )
        ).json()["id"]
        resp = await client.post(f"/api/v1/rubrics/{rid}/set-default", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["is_default"] is True
