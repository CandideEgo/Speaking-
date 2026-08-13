"""AI learning plan API tests (Pro feature, ADR-0012) — mocked LLM.

POST /plan/generate/ai persisted plans with zero test coverage before; the AI
service is replaced with a fake so the endpoint + persistence path is
exercised end-to-end.
"""

from sqlalchemy import select

from app.models.learning_plan import LearningPlan, LearningPlanItem


async def test_generate_ai_plan_endpoint_with_mocked_llm(client, pro_headers, monkeypatch):
    import app.services.ai_plan_service as ai_plan_mod

    class _FakeAI:
        async def generate_learning_plan(self, **kwargs):
            return [
                {"item_type": "review_words", "count": 3},
                {"item_type": "vocab_drill", "count": 5},
            ]

    monkeypatch.setattr(ai_plan_mod, "get_ai_service", lambda: _FakeAI())

    resp = await client.post("/api/v1/plan/generate/ai", headers=pro_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "completed"
    assert data["plan_id"]

    from app.models.user import User
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        user = (await db.execute(select(User).where(User.phone == "13700137000"))).scalar_one()
        plan = (await db.execute(select(LearningPlan).where(LearningPlan.user_id == user.id))).scalars().first()
        assert plan is not None
        assert plan.generation_method == "ai"
        items = (
            (await db.execute(select(LearningPlanItem).where(LearningPlanItem.plan_id == plan.id)))
            .scalars()
            .all()
        )
        assert {i.item_type for i in items} == {"review_words", "vocab_drill"}


async def test_generate_ai_plan_falls_back_to_rule_engine(client, pro_headers, monkeypatch):
    """When the AI service raises, the endpoint must fall back to the rule
    engine and still return 200 with a plan."""
    import app.services.ai_plan_service as ai_plan_mod
    from app.services.ai_service import AIServiceError

    class _FailingAI:
        async def generate_learning_plan(self, **kwargs):
            raise AIServiceError("LLM down")

    monkeypatch.setattr(ai_plan_mod, "get_ai_service", lambda: _FailingAI())

    resp = await client.post("/api/v1/plan/generate/ai", headers=pro_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "completed"
    assert data["plan_id"]

    from app.models.user import User
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        user = (await db.execute(select(User).where(User.phone == "13700137000"))).scalar_one()
        plan = (await db.execute(select(LearningPlan).where(LearningPlan.user_id == user.id))).scalars().first()
        assert plan is not None
        assert plan.generation_method == "rule"
