"""Official SDK adapter. Import only in an SDK-compatible, locked runtime."""

import json
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from datetime import UTC, datetime
from urllib.parse import urlsplit

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.database import get_async_session_maker
from app.core.errors import AppError
from app.models.learning import Vocabulary
from app.models.learning_plan import UserLearningProfile
from app.services.external_connection_service import authenticate
from app.services.teaching import service as core
from app.services.teaching.context import get_learning_context as project_context
from app.services.teaching.context import resume_url
from app.services.teaching.principal import Principal, require_scope

_token: ContextVar[str] = ContextVar("seeword_external_token", default="")


class CredentialGate:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {key.decode().lower(): value.decode() for key, value in scope.get("headers", [])}
        settings = get_settings()
        hosts = {v.strip() for v in settings.mcp_allowed_hosts.split(",") if v.strip()}
        origins = {v.strip() for v in settings.mcp_allowed_origins.split(",") if v.strip()}
        try:
            host = urlsplit("//" + headers.get("host", "")).hostname
        except ValueError:
            return await JSONResponse({"error": "Invalid Host header"}, status_code=400)(scope, receive, send)
        if host not in hosts or (headers.get("origin") and headers["origin"] not in origins):
            return await JSONResponse({"error": "MCP origin or host is not allowed"}, status_code=403)(
                scope, receive, send
            )
        auth = headers.get("authorization", "").split(" ", 1)
        token = auth[1] if len(auth) == 2 and auth[0].lower() == "bearer" else ""
        try:
            async with get_async_session_maker()() as db:
                await authenticate(db, token)
        except AppError as exc:
            return await JSONResponse(
                {"error": exc.code, "message": exc.message},
                status_code=exc.status_code,
                headers={"WWW-Authenticate": 'Bearer realm="SeeWord"', "Cache-Control": "no-store"},
            )(scope, receive, send)
        context_token = _token.set(token)
        try:
            return await self.app(scope, receive, send)
        finally:
            _token.reset(context_token)


async def invoke(action: Callable[[AsyncSession, Principal], Awaitable[dict]], *, write=False) -> dict:
    """Re-authenticate and lock the connection for every tool transaction."""
    from mcp.server.mcpserver.exceptions import ToolError

    try:
        async with get_async_session_maker()() as db:
            principal = await authenticate(db, _token.get(), write=write)
            result = await action(db, principal)
            await db.commit()
            return result
    except AppError as exc:
        raise ToolError(json.dumps({"code": exc.code, "message": exc.message}, ensure_ascii=False)) from None
    except ValidationError:
        raise ToolError(
            json.dumps({"code": "VALIDATION_ERROR", "message": "工具参数无效"}, ensure_ascii=False)
        ) from None


def create_mcp_app():
    from mcp.server.mcpserver import MCPServer
    from mcp.server.transport_security import TransportSecuritySettings

    server = MCPServer(
        "SeeWord",
        version="1.0.0",
        instructions=(
            "Use list_teaching_sessions to continue an existing session. Only explicit submit_answer records an auxiliary "
            "attempt. External answers have unverified independence and do not change official scores. "
            "Reuse operation_id on a retry; refresh the session on a revision conflict. Never infer permission from a link."
        ),
    )

    @server.tool()
    async def list_teaching_sessions() -> dict:
        async def action(db, principal):
            result = await core.list_sessions(db, principal)
            for row in result["items"]:
                row["resume_url"] = resume_url(row["id"], row["current_item_id"] or "")
            return result

        return await invoke(action)

    @server.tool()
    async def get_teaching_session(session_id: str) -> dict:
        return await invoke(lambda db, principal: core.get_session(db, principal, session_id))

    @server.tool()
    async def get_learning_context(session_id: str) -> dict:
        async def action(db, principal):
            return (await project_context(db, principal, session_id)).model_dump(mode="json")

        return await invoke(action)

    @server.tool()
    async def get_exam_question(session_id: str, item_id: str) -> dict:
        async def action(db, principal):
            state = await core.get_session(db, principal, session_id)
            if item_id not in {item["id"] for item in state["items"]}:
                raise AppError(404, "NOT_FOUND", "教学题目不存在")
            return {
                "session_id": session_id,
                "revision": state["revision"],
                "cards": [
                    card
                    for card in state["cards"]
                    if card["item_id"] == item_id and card["kind"] in {"question", "status"}
                ],
            }

        return await invoke(action)

    @server.tool()
    async def get_question_analysis(session_id: str, item_id: str) -> dict:
        async def action(db, principal):
            require_scope(principal, "teaching:analysis:read")
            state = await core.get_session(db, principal, session_id)
            cards = [
                card
                for card in state["cards"]
                if card["item_id"] == item_id and card["kind"] in {"analysis", "evidence"}
            ]
            if not cards:
                raise AppError(409, "TEACHING_STATE_CONFLICT", "请先在网页明确揭晓，或单独授权揭晓动作")
            return {"session_id": session_id, "revision": state["revision"], "cards": cards}

        return await invoke(action)

    @server.tool()
    async def submit_answer(
        session_id: str, item_id: str, answer: str, operation_id: str, expected_revision: int
    ) -> dict:
        async def action(db, principal):
            state = await core.submit_attempt(
                db,
                principal,
                session_id,
                {
                    "item_id": item_id,
                    "answer": answer,
                    "operation_id": operation_id,
                    "expected_revision": expected_revision,
                },
            )
            return {
                "session": state,
                "attempt_id": state["operation_result"]["attempt_id"],
                "actor": "external_agent",
                "answer_origin": "external_reported",
                "server_graded": True,
                "independence": "unverified",
                "counts_toward_official_score": False,
                "counts_toward_mastery": False,
                "counts_toward_meaningful_learning_day": False,
            }

        return await invoke(action, write=True)

    @server.tool()
    async def reveal_question_analysis(
        session_id: str, item_id: str, operation_id: str, expected_revision: int
    ) -> dict:
        return await invoke(
            lambda db, principal: core.reveal_answer(
                db,
                principal,
                session_id,
                {
                    "item_id": item_id,
                    "operation_id": operation_id,
                    "expected_revision": expected_revision,
                },
            ),
            write=True,
        )

    @server.tool()
    async def record_learning_feedback(
        session_id: str, item_id: str, content: str, operation_id: str, expected_revision: int
    ) -> dict:
        return await invoke(
            lambda db, principal: core.record_feedback(
                db,
                principal,
                session_id,
                {
                    "item_id": item_id,
                    "content": content,
                    "operation_id": operation_id,
                    "expected_revision": expected_revision,
                },
            ),
            write=True,
        )

    @server.tool()
    async def get_learning_profile() -> dict:
        async def action(db, principal):
            require_scope(principal, "learning:profile:read")
            profile = await db.scalar(
                select(UserLearningProfile).where(UserLearningProfile.user_id == principal.user_id)
            )
            return {
                "estimated_level": profile.estimated_level if profile else None,
                "mastery_by_level": profile.mastery_by_level if profile else {},
                "source": "legacy_profile",
                "teaching_statistics": "separate",
            }

        return await invoke(action)

    @server.tool()
    async def get_review_tasks() -> dict:
        async def action(db, principal):
            require_scope(principal, "review:read")
            rows = (
                await db.execute(
                    select(Vocabulary)
                    .where(Vocabulary.user_id == principal.user_id, Vocabulary.next_review_at <= datetime.now(UTC))
                    .order_by(Vocabulary.next_review_at)
                    .limit(30)
                )
            ).scalars()
            return {
                "items": [
                    {
                        "id": row.id,
                        "word": row.word,
                        "next_review_at": row.next_review_at.isoformat(),
                        "resume_url": "/practice",
                    }
                    for row in rows
                ]
            }

        return await invoke(action)

    # No process-local protocol sessions: requests can move between web workers.
    settings = get_settings()
    hosts = [value.strip() for value in settings.mcp_allowed_hosts.split(",") if value.strip()]
    origins = [value.strip() for value in settings.mcp_allowed_origins.split(",") if value.strip()]
    app = server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        max_request_body_size=65536,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=hosts + [f"{host}:*" for host in hosts],
            allowed_origins=origins,
        ),
    )
    app.add_middleware(CredentialGate)
    return app
