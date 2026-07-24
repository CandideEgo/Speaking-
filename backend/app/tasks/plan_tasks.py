"""Celery task for async AI learning plan generation (ADR-0012, Pro feature).

AI plan generation can take several seconds due to LLM latency. For
non-blocking UX, the API endpoint can dispatch this task and the frontend
polls for completion. The task writes the generated plan to the DB.
"""

import structlog

from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(bind=True)
def generate_ai_plan_task(self, user_id: str):
    """Generate an AI-powered learning plan asynchronously.

    Writes the plan to the DB. The frontend polls GET /plan/today to
    detect the new plan.
    """
    from app.services.ai_plan_service import generate_ai_plan

    async def _process():
        from app.core.database import async_session

        async with async_session() as db:
            try:
                plan = await generate_ai_plan(db, user_id)
                logger.info(
                    "ai_plan_generated",
                    user_id=user_id,
                    plan_id=plan.get("id"),
                    method=plan.get("generation_method"),
                )
                return {"plan_id": plan.get("id"), "status": "completed"}
            except Exception as e:
                logger.exception("ai_plan_generation_failed", user_id=user_id, error=str(e))
                return {"status": "failed", "error": str(e)}

    return run_async(_process())
