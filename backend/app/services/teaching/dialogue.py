"""Task-owned durable conversation, projected with current material permissions."""

import copy
import json

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.v2_runtime import AgentRun, TeachingMessage
from app.schemas.teaching_dialogue import TutorReply
from app.services.external_connection_service import utc
from app.services.teaching.context import get_learning_context
from app.services.teaching.principal import Principal


def _allowed(principal: Principal) -> None:
    if principal.actor not in {"user_ui", "internal_agent"}:
        raise AppError(403, "INSUFFICIENT_SCOPE", "此入口未授权读取任务对话")


def sources(context: dict) -> list[dict]:
    return [card for card in context["cards"] if card["kind"] in {"question", "analysis", "evidence"}]


def project(row: TeachingMessage, context: dict, run_status: str | None) -> dict:
    current = {card["card_id"] for card in sources(context)}
    restricted = (
        context["material"]["restricted"]
        or row.content_revision_id != context["material"]["content_revision_id"]
        or (row.requires_reveal and not any(card["kind"] == "analysis" for card in context["cards"]))
        or not set(row.body.get("citation_ids", [])).issubset(current)
    )
    return {
        "id": row.id,
        "session_id": row.session_id,
        "sequence": row.sequence,
        "session_revision": row.session_revision,
        "run_id": row.run_id,
        "run_status": run_status,
        "role": row.role,
        "body": None if restricted else copy.deepcopy(row.body),
        "restricted": bool(restricted),
        "created_at": utc(row.created_at).isoformat(),
    }


async def append(
    db: AsyncSession, run: AgentRun, context: dict, role: str, body: dict, *, requires_reveal=False
) -> TeachingMessage:
    """Caller holds the session write lock; message and run outcome commit together."""
    sequence = (
        await db.scalar(select(func.max(TeachingMessage.sequence)).where(TeachingMessage.session_id == run.session_id))
        or 0
    ) + 1
    row = TeachingMessage(
        user_id=run.user_id,
        session_id=run.session_id,
        run_id=run.id,
        content_revision_id=context["material"]["content_revision_id"],
        sequence=sequence,
        session_revision=run.bound_session_revision,
        role=role,
        body=copy.deepcopy(body),
        requires_reveal=requires_reveal,
    )
    db.add(row)
    await db.flush()
    return row


async def page(db: AsyncSession, principal: Principal, session_id: str, *, after=0, limit=50) -> dict:
    _allowed(principal)
    context = (await get_learning_context(db, principal, session_id)).model_dump(mode="json")
    rows = (
        await db.execute(
            select(TeachingMessage, AgentRun.status)
            .outerjoin(AgentRun, AgentRun.id == TeachingMessage.run_id)
            .where(
                TeachingMessage.session_id == session_id,
                TeachingMessage.user_id == principal.user_id,
                TeachingMessage.sequence > after,
            )
            .order_by(TeachingMessage.sequence)
            .limit(limit + 1)
        )
    ).all()
    visible = rows[:limit]
    return {
        "items": [project(row, context, status) for row, status in visible],
        "next_after": visible[-1][0].sequence if visible else after,
        "has_more": len(rows) > limit,
    }


async def export_messages(db: AsyncSession, principal: Principal, sessions: list[dict]) -> list[dict]:
    """Reuse the export's current site projection, without holding cross-task locks."""
    _allowed(principal)
    contexts = {}
    for state in sessions:
        item = next((i for i in state["items"] if i["id"] == state["current_item_id"]), None)
        contexts[state["id"]] = {
            "material": {
                "restricted": not any(c["kind"] == "question" for c in state["cards"]),
                "content_revision_id": item["content_revision_id"] if item else None,
            },
            "cards": state["cards"],
        }
    rows = (
        await db.execute(
            select(TeachingMessage, AgentRun.status)
            .outerjoin(AgentRun, AgentRun.id == TeachingMessage.run_id)
            .where(TeachingMessage.user_id == principal.user_id)
            .order_by(TeachingMessage.session_id, TeachingMessage.sequence)
        )
    ).all()
    return [project(row, contexts[row.session_id], status) for row, status in rows if row.session_id in contexts]


async def event_message(db: AsyncSession, principal: Principal, session_id: str, message_id: str) -> dict | None:
    _allowed(principal)
    row = await db.scalar(
        select(TeachingMessage).where(
            TeachingMessage.id == message_id,
            TeachingMessage.session_id == session_id,
            TeachingMessage.user_id == principal.user_id,
        )
    )
    if row is None:
        return None
    context = (await get_learning_context(db, principal, session_id)).model_dump(mode="json")
    return project(row, context, None)


async def model_input(db: AsyncSession, principal: Principal, run: AgentRun) -> dict:
    context = (await get_learning_context(db, principal, run.session_id)).model_dump(mode="json")
    rows = list(
        (
            await db.execute(
                select(TeachingMessage)
                .where(
                    TeachingMessage.session_id == run.session_id,
                    TeachingMessage.user_id == principal.user_id,
                    or_(TeachingMessage.run_id != run.id, TeachingMessage.run_id.is_(None)),
                )
                .order_by(TeachingMessage.sequence.desc())
                .limit(7)
            )
        ).scalars()
    )
    history, size = [], 0
    for row in rows[:6]:
        projected = project(row, context, None)
        if projected["restricted"]:
            continue
        message = {"role": row.role, "text": row.body["text"]}
        added = len(json.dumps(message, ensure_ascii=False).encode())
        if size + added > 8000:
            break
        history.append(message)
        size += added
    history.reverse()
    return {"learning_context": context, "history": history, "history_truncated": len(history) < len(rows)}


def validate_reply(reply: TutorReply, context: dict) -> None:
    ids = {card["card_id"] for card in sources(context)}
    revealed = any(card["kind"] == "analysis" for card in context["cards"])
    if (
        not reply.text.strip()
        or not set(reply.citation_ids).issubset(ids)
        or (reply.source == "model" and (not revealed or not reply.citation_ids))
        or (reply.suggested_answer is not None and not revealed)
    ):
        raise AppError(502, "AI_SERVICE_UNAVAILABLE", "导师回复未通过当前上下文校验")


def before_reveal() -> TutorReply:
    return TutorReply(
        text="先在题面保存或提交你的判断。需要帮助时可选择分级提示；揭晓后，我会结合原文证据解释你的问题。聊天不会替你提交答案。",
        source="policy",
    )
