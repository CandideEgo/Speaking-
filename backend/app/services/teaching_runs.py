"""Durable execution and independently reconnectable, permission-projected events."""

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.models.v2_runtime import AgentRun, AgentRunEvent, AgentStep
from app.services.external_connection_service import utc
from app.services.teaching import dialogue
from app.services.teaching import service as core
from app.services.teaching.context import get_learning_context
from app.services.teaching_gateway import choose_intent, require_gateway, tutor_reply
from app.services.v2_access import require_access

TERMINAL = {"succeeded", "failed", "cancelled", "needs_retry"}


def summary(run: AgentRun) -> dict:
    return {
        "id": run.id,
        "run_id": run.id,
        "session_id": run.session_id,
        "status": run.status,
        "last_sequence": run.last_sequence,
        "cards": [],
        "error_code": run.error_code,
        "state_url": f"/api/v1/teaching/runs/{run.id}",
        "events_url": f"/api/v1/teaching/runs/{run.id}/events",
        "response_mode": run.response_mode,
    }


def projected_cards(run: AgentRun, state: dict) -> list[dict]:
    cards = list(state["cards"])
    if any(card["kind"] == "question" for card in cards):
        cards.append(
            {
                "schema_version": 1,
                "card_id": f"{run.id}:action",
                "session_id": state["id"],
                "item_id": state["current_item_id"],
                "session_revision": state["revision"],
                "kind": "status",
                "payload": {
                    "code": "TEACHING_ACTION_REQUIRED",
                    "message": "可以回到题面作答，或选择分级提示和揭晓解析。",
                },
            }
        )
    return cards


async def _owned(db: AsyncSession, user_id: str, run_id: str, *, lock: bool = False) -> AgentRun:
    query = select(AgentRun).where(AgentRun.id == run_id, AgentRun.user_id == user_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    run = (await db.execute(query)).scalar_one_or_none()
    if run is None:
        raise NotFoundError("讲解任务不存在")
    return run


def append_event(db: AsyncSession, run: AgentRun, kind: str, payload: dict | None = None) -> None:
    run.last_sequence += 1
    db.add(
        AgentRunEvent(
            run_id=run.id,
            sequence=run.last_sequence,
            type=kind,
            session_revision=run.bound_session_revision,
            safe_payload=payload or {},
        )
    )


async def create(db: AsyncSession, principal, session_id: str, body, *, response_mode="cards") -> dict:
    if principal.actor != "user_ui":
        raise AppError(403, "INSUFFICIENT_SCOPE", "只能由网页明确创建讲解任务")
    await require_access(db, principal.user_id, "teaching_runs_enabled")
    if response_mode not in {"cards", "conversation"}:
        raise AppError(422, "VALIDATION_ERROR", "未知讲解模式")
    if response_mode == "conversation":
        await require_access(db, principal.user_id, "teaching_dialogue_enabled")
    require_gateway()
    # Serialize starts before reading receipts, including the same operation on
    # two different sessions. Other teaching writes do not acquire this lock.
    if db.get_bind().dialect.name == "postgresql":
        await db.execute(select(func.pg_advisory_xact_lock(192837461)))
    session = await core.owned_session(db, principal, session_id, lock=True)
    request = {"session_id": session_id, "message": body.message, "expected_revision": body.expected_revision}
    # Preserve the legacy cards digest so existing operation receipts still replay.
    if response_mode != "cards":
        request["response_mode"] = response_mode
    digest = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
    prior = (
        await db.execute(
            select(AgentRun).where(AgentRun.user_id == principal.user_id, AgentRun.operation_id == body.operation_id)
        )
    ).scalar_one_or_none()
    if prior:
        if prior.request_hash != digest:
            raise AppError(409, "IDEMPOTENCY_CONFLICT", "操作编号已用于不同请求")
        return summary(prior)
    if session.revision != body.expected_revision:
        raise AppError(409, "TEACHING_REVISION_CONFLICT", "教学状态已更新，请重新读取")
    if session.status != "active":
        raise AppError(409, "TEACHING_STATE_CONFLICT", "教学会话已结束")
    active = (await db.execute(select(AgentRun).where(AgentRun.status.in_(["queued", "running"])))).scalars().all()
    if any(row.user_id == principal.user_id for row in active) or len(active) >= 4:
        raise AppError(429, "CONCURRENCY_LIMITED", "讲解任务正在处理中，请稍后重试")
    now = datetime.now(UTC)
    run = AgentRun(
        user_id=principal.user_id,
        session_id=session_id,
        operation_id=body.operation_id,
        request_hash=digest,
        message=body.message,
        response_mode=response_mode,
        bound_session_revision=session.revision,
        queue_deadline_at=now + timedelta(seconds=60),
        last_sequence=0,
    )
    db.add(run)
    await db.flush()
    if response_mode == "conversation":
        context = (await get_learning_context(db, principal, session_id)).model_dump(mode="json")
        if context["material"]["restricted"]:
            raise AppError(409, "CONTENT_RESTRICTED", "教学内容不可用")
        await dialogue.append(db, run, context, "user", {"text": body.message})
    return summary(run)


async def get(db: AsyncSession, principal, run_id: str) -> dict:
    run = await _owned(db, principal.user_id, run_id)
    state = await core.get_session(db, principal, run.session_id)
    result = summary(run)
    if state["revision"] == run.bound_session_revision:
        references = (
            await db.execute(
                select(AgentRunEvent.safe_payload).where(
                    AgentRunEvent.run_id == run.id, AgentRunEvent.type == "card.upsert"
                )
            )
        ).scalars()
        ids = {value.get("card_id") for value in references}
        result["cards"] = [card for card in projected_cards(run, state) if card["card_id"] in ids]
    return result


async def events(db: AsyncSession, principal, run_id: str, after: int) -> tuple[list[dict], str]:
    run = await _owned(db, principal.user_id, run_id)
    if after > run.last_sequence:
        raise AppError(409, "EVENT_CURSOR_INVALID", "事件游标超出当前运行范围")
    if utc(run.created_at) < datetime.now(UTC) - timedelta(hours=24):
        raise AppError(410, "EVENT_CURSOR_EXPIRED", "运行事件已过期，请读取当前教学状态")
    state = await core.get_session(db, principal, run.session_id)
    current_cards = {card["card_id"]: card for card in projected_cards(run, state)}
    rows = (
        await db.execute(
            select(AgentRunEvent)
            .where(AgentRunEvent.run_id == run_id, AgentRunEvent.sequence > after)
            .order_by(AgentRunEvent.sequence)
        )
    ).scalars()
    result = []
    for row in rows:
        kind, payload = row.type, row.safe_payload
        if kind == "card.upsert":
            card = current_cards.get(payload.get("card_id"))
            if card is None or state["revision"] != row.session_revision:
                kind, payload = "content.restricted", {"card_id": payload.get("card_id")}
            else:
                payload = {"card": card}
        elif kind == "message.upsert":
            message = await dialogue.event_message(db, principal, run.session_id, payload.get("message_id", ""))
            if message is None or message["restricted"]:
                kind, payload = "content.restricted", {"message_id": payload.get("message_id")}
            else:
                payload = {"message": message}
        result.append(
            {
                "schema_version": 1,
                "run_id": run.id,
                "sequence": row.sequence,
                "session_revision": row.session_revision,
                "type": kind,
                "payload": payload,
            }
        )
    return result, run.status


async def cancel(db: AsyncSession, principal, run_id: str) -> dict:
    observed = await _owned(db, principal.user_id, run_id)
    await core.owned_session(db, principal, observed.session_id, lock=True)
    run = await _owned(db, principal.user_id, run_id, lock=True)
    if run.status not in TERMINAL:
        run.cancel_requested_at = datetime.now(UTC)
        run.status, run.finished_at = "cancelled", datetime.now(UTC)
        append_event(db, run, "run.cancelled", {"status": "cancelled"})
    return summary(run)


async def execute(run_id: str) -> None:
    """Committed dispatch intent is never automatically repeated after uncertainty."""
    from app.core.database import get_async_session_maker

    maker = get_async_session_maker()
    async with maker() as db:
        found = await db.get(AgentRun, run_id)
        if found is None:
            return
        principal = core.Principal(found.user_id, actor="internal_agent")
        await core.owned_session(db, principal, found.session_id, lock=True)
        run = await _owned(db, found.user_id, run_id, lock=True)
        if run.status != "queued":
            return
        now = datetime.now(UTC)
        if utc(run.queue_deadline_at) < now:
            run.status, run.error_code, run.finished_at = "failed", "QUEUE_TIMEOUT", now
            append_event(db, run, "run.failed", {"error_code": run.error_code})
            await db.commit()
            return
        try:
            await require_access(db, run.user_id, "teaching_runs_enabled")
            if run.response_mode == "conversation":
                await require_access(db, run.user_id, "teaching_dialogue_enabled")
            state = await core.get_session(db, principal, run.session_id)
            if state["revision"] != run.bound_session_revision:
                raise AppError(409, "TEACHING_CONTEXT_CHANGED", "教学状态已变化")
            # Model input uses the model rights projection, never merely site-visible data.
            from app.models.teaching import ExamAnalysisRevision, TeachingItem
            from app.services.teaching.content import project_content

            item = (
                await db.execute(select(TeachingItem).where(TeachingItem.session_id == run.session_id))
            ).scalar_one()
            content = await db.get(ExamAnalysisRevision, item.content_revision_id)
            if content is None:
                raise AppError(409, "CONTENT_RESTRICTED", "教学内容不可用")
            projected = await project_content(db, content, principal, disclosed=False, target="model")
            if projected.get("restricted"):
                raise AppError(409, "CONTENT_RESTRICTED", "材料当前不允许模型处理")
            context = (await get_learning_context(db, principal, run.session_id)).model_dump(mode="json")
            if run.response_mode == "conversation":
                context = await dialogue.model_input(db, principal, run)
            run.status = "running"
            run.lease_epoch += 1
            epoch = run.lease_epoch
            run.execution_deadline_at = now + timedelta(seconds=30)
            run.lease_expires_at = run.execution_deadline_at
            deadline = run.execution_deadline_at
            message = run.message or ""
            logical_call = str(uuid.uuid4())
            step = AgentStep(
                run_id=run.id,
                seq=1,
                kind="policy"
                if run.response_mode == "conversation" and not any(c["kind"] == "analysis" for c in state["cards"])
                else "model",
                status="dispatched",
                lease_epoch=epoch,
                logical_call_id=logical_call,
            )
            db.add(step)
            append_event(db, run, "run.started", {"status": "running"})
            await db.commit()
        except AppError as exc:
            run.status, run.error_code, run.finished_at = "needs_retry", exc.code, now
            append_event(db, run, "run.failed", {"error_code": exc.code})
            await db.commit()
            return
    intent, error, reply = None, None, None

    async def validate_dispatch():
        # Key issuance is network I/O. Recheck after it, immediately before the
        # model request, with no database transaction held across that request.
        async with maker() as check_db:
            session = await core.owned_session(check_db, principal, run.session_id, lock=True)
            checked = await _owned(check_db, principal.user_id, run_id, lock=True)
            await require_access(check_db, checked.user_id, "teaching_runs_enabled")
            if checked.response_mode == "conversation":
                await require_access(check_db, checked.user_id, "teaching_dialogue_enabled")
            if (
                checked.status != "running"
                or checked.lease_epoch != epoch
                or checked.cancel_requested_at
                or session.revision != checked.bound_session_revision
            ):
                raise AppError(409, "TEACHING_CONTEXT_CHANGED", "教学状态已变化")
            from app.services.teaching.content import project_content

            revision = await check_db.get(ExamAnalysisRevision, item.content_revision_id, with_for_update=True)
            if revision is None:
                raise AppError(409, "CONTENT_RESTRICTED", "教学内容不可用")
            projected = await project_content(check_db, revision, principal, disclosed=True, target="model")
            if projected.get("restricted"):
                raise AppError(409, "CONTENT_RESTRICTED", "材料当前不允许模型处理")
            if checked.response_mode == "conversation":
                return await dialogue.model_input(check_db, principal, checked)
            return (await get_learning_context(check_db, principal, session.id)).model_dump(mode="json")

    try:
        # Before reveal, only trusted hint/actions are displayed; no answer is sent to a model.
        if run.response_mode == "conversation":
            if any(card["kind"] == "analysis" for card in state["cards"]):
                reply = await tutor_reply(
                    principal.user_id,
                    run_id,
                    logical_call,
                    message,
                    context,
                    deadline,
                    before_dispatch=validate_dispatch,
                )
            else:
                reply = dialogue.before_reveal()
        elif any(card["kind"] == "analysis" for card in state["cards"]):
            intent = await choose_intent(
                principal.user_id, run_id, logical_call, message, context, deadline, before_dispatch=validate_dispatch
            )
        else:
            intent = "suggest_retry"
    except AppError as exc:
        error = exc.code
    async with maker() as db:
        session = await core.owned_session(db, principal, run.session_id, lock=True)
        current = await _owned(db, principal.user_id, run_id, lock=True)
        step = (await db.execute(select(AgentStep).where(AgentStep.run_id == run_id, AgentStep.seq == 1))).scalar_one()
        # A cancelled or obsolete lease can settle usage in the gateway but cannot publish.
        if current.status != "running" or current.lease_epoch != epoch:
            step.status = "uncertain" if error else "completed"
            await db.commit()
            return
        try:
            await require_access(db, current.user_id, "teaching_runs_enabled")
            if current.response_mode == "conversation":
                await require_access(db, current.user_id, "teaching_dialogue_enabled")
            state = await core.get_session(db, principal, session.id)
            from app.services.teaching.content import project_content

            content = await db.get(ExamAnalysisRevision, item.content_revision_id, with_for_update=True)
            if content is None:
                raise AppError(409, "CONTENT_RESTRICTED", "教学内容不可用")
            projected = await project_content(db, content, principal, disclosed=False, target="model")
            if projected.get("restricted"):
                raise AppError(409, "CONTENT_RESTRICTED", "材料当前不允许模型处理")
            if session.revision != current.bound_session_revision:
                error = "TEACHING_CONTEXT_CHANGED"
            if datetime.now(UTC) > utc(deadline):
                error = error or "EXECUTION_TIMEOUT"
        except AppError as exc:
            error = exc.code
        if error:
            current.status, current.error_code = "needs_retry", error
            step.status = "uncertain"
            append_event(db, current, "run.failed", {"error_code": error})
        elif current.response_mode == "conversation":
            context = (await get_learning_context(db, principal, session.id)).model_dump(mode="json")
            try:
                if reply is None:
                    raise AppError(502, "AI_SERVICE_UNAVAILABLE", "导师回复缺失")
                dialogue.validate_reply(reply, context)
            except AppError as exc:
                current.status, current.error_code = "needs_retry", exc.code
                step.status = "uncertain"
                append_event(db, current, "run.failed", {"error_code": exc.code})
            else:
                response = await dialogue.append(
                    db, current, context, "assistant", reply.model_dump(), requires_reveal=reply.source == "model"
                )
                step.status, step.safe_result = "completed", {"message_id": response.id}
                current.status = "succeeded"
                append_event(db, current, "message.upsert", {"message_id": response.id})
                append_event(db, current, "run.completed", {"status": "succeeded"})
        else:
            kind = {"show_analysis": "analysis", "show_evidence": "evidence", "suggest_retry": "status"}[
                intent or "suggest_retry"
            ]
            cards = [card for card in projected_cards(current, state) if card["kind"] == kind]
            for card in cards:
                # Events persist references, not privileged response snapshots.
                append_event(db, current, "card.upsert", {"card_id": card["card_id"]})
            step.status, step.safe_result = "completed", {"intent": intent}
            current.status = "succeeded"
            append_event(db, current, "run.completed", {"status": "succeeded"})
        current.finished_at = datetime.now(UTC)
        await db.commit()


async def sweep(db: AsyncSession) -> list[str]:
    now = datetime.now(UTC)
    rows = (
        await db.execute(
            select(AgentRun).where(AgentRun.status.in_(["queued", "running"])).with_for_update(skip_locked=True)
        )
    ).scalars()
    dispatch = []
    for run in rows:
        deadline = run.queue_deadline_at if run.status == "queued" else run.lease_expires_at
        expired = deadline is None or utc(deadline) < now
        if expired:
            run.status, run.error_code, run.finished_at = "needs_retry", "EXECUTION_UNCERTAIN", now
            append_event(db, run, "run.failed", {"error_code": run.error_code})
        elif run.status == "queued":
            dispatch.append(run.id)
    old = select(AgentRun.id).where(AgentRun.created_at < now - timedelta(hours=24), AgentRun.status.in_(TERMINAL))
    await db.execute(delete(AgentRunEvent).where(AgentRunEvent.run_id.in_(old)))
    await db.execute(delete(AgentStep).where(AgentStep.run_id.in_(old)))
    from sqlalchemy import update

    await db.execute(update(AgentRun).where(AgentRun.id.in_(old)).values(message=None))
    from app.models.teaching import TeachingFeedback

    await db.execute(delete(TeachingFeedback).where(TeachingFeedback.expires_at <= now))
    await db.commit()
    return dispatch
