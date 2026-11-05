"""Admin content lifecycle. Callers own transactions; network proof precedes locks."""

import copy
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.content_publication import ContentPublicationOperation, TeachingContentDraft
from app.models.teaching import ExamAnalysisRevision
from app.models.user import RoleType, User
from app.schemas.content_publication import (
    ContentDraftResponse,
    ContentPreflightResponse,
    CreateContentDraft,
    PublishContentDraft,
    UpdateContentDraft,
    WithdrawContentRevision,
)
from app.schemas.pagination import paginated
from app.services.teaching import content

ReceiptVerifier = Callable[[dict], Awaitable[bool]]


async def require_admin_actor(db: AsyncSession, actor_id: str) -> None:
    user = await db.scalar(
        select(User).where(User.id == actor_id).with_for_update(read=True).execution_options(populate_existing=True)
    )
    if user is None or user.role != RoleType.admin or user.is_banned or user.deletion_requested_at:
        raise AppError(403, "FORBIDDEN", "当前账号无内容发布管理权限")


def receipt_verifier() -> ReceiptVerifier | None:
    from app.services import teaching_gateway

    # Only server wiring may provide this adapter. No request supplies a
    # verifier, trusted boolean, provider URL or alternate verification policy.
    value = teaching_gateway.content_receipt_verifier()
    return cast("ReceiptVerifier", value) if callable(value) else None


def _validate(manifest: dict) -> dict:
    return content.validate_candidate(manifest)


def _hash(action: str, target: str | None, body: dict) -> str:
    return content.stable_hash({"action": action, "target": target, "body": body})


async def _prior(db: AsyncSession, actor_id: str, operation_id: str, request_hash: str):
    row = await db.scalar(
        select(ContentPublicationOperation).where(
            ContentPublicationOperation.actor_id == actor_id,
            ContentPublicationOperation.operation_id == operation_id,
        )
    )
    if row is not None and row.request_hash != request_hash:
        raise AppError(409, "IDEMPOTENCY_CONFLICT", "操作编号已用于不同内容")
    return row


async def _claim(db: AsyncSession, actor_id: str, operation_id: str, action: str, target: str | None, body: dict):
    request_hash = _hash(action, target, body)
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    inserted = await db.scalar(
        insert(ContentPublicationOperation)
        .values(
            id=str(uuid.uuid4()),
            actor_id=actor_id,
            operation_id=operation_id,
            action=action,
            target_id=target,
            request_hash=request_hash,
            status="reserved",
            result_refs={},
            created_at=datetime.now(UTC),
        )
        .on_conflict_do_nothing(index_elements=["actor_id", "operation_id"])
        .returning(ContentPublicationOperation.id)
    )
    row = await db.scalar(
        select(ContentPublicationOperation)
        .where(
            ContentPublicationOperation.actor_id == actor_id, ContentPublicationOperation.operation_id == operation_id
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None or row.request_hash != request_hash:
        raise AppError(409, "IDEMPOTENCY_CONFLICT", "操作编号已用于不同内容")
    if inserted is None and row.status != "completed":
        raise AppError(409, "CONFLICT", "内容操作尚未完成")
    return row, inserted is None


async def _draft(db: AsyncSession, draft_id: str, *, lock=False) -> TeachingContentDraft:
    query = select(TeachingContentDraft).where(TeachingContentDraft.id == draft_id)
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query.execution_options(populate_existing=True))
    if row is None:
        raise AppError(404, "NOT_FOUND", "内容草稿不存在")
    return row


def _editable(row: TeachingContentDraft, expected_version: int) -> None:
    if row.version != expected_version:
        raise AppError(409, "CONTENT_REVISION_MISMATCH", "草稿已更新，请重新读取")
    if row.published_revision_id:
        raise AppError(409, "CONFLICT", "已发布草稿不可修改，请创建新候选版本")


async def draft_detail(db: AsyncSession, draft_id: str, *, replayed=False) -> ContentDraftResponse:
    row = await _draft(db, draft_id)
    revision = (
        await db.get(ExamAnalysisRevision, row.published_revision_id, populate_existing=True)
        if row.published_revision_id
        else None
    )
    return ContentDraftResponse.model_validate(
        {
            "id": row.id,
            "version": row.version,
            "manifest": row.manifest,
            "published_revision_id": row.published_revision_id,
            "publication_status": revision.status if revision else "draft",
            "replayed": replayed,
        }
    )


async def list_drafts(db: AsyncSession, *, page: int, page_size: int) -> dict:
    total = await db.scalar(select(func.count()).select_from(TeachingContentDraft)) or 0
    rows = (
        await db.execute(
            select(
                TeachingContentDraft.id,
                TeachingContentDraft.version,
                TeachingContentDraft.published_revision_id,
                ExamAnalysisRevision.status,
            )
            .outerjoin(ExamAnalysisRevision, ExamAnalysisRevision.id == TeachingContentDraft.published_revision_id)
            .order_by(TeachingContentDraft.created_at.desc(), TeachingContentDraft.id)
            .offset((page - 1) * page_size)
            .limit(page_size + 1)
        )
    ).all()
    items = [
        {
            "id": row.id,
            "version": row.version,
            "published_revision_id": row.published_revision_id,
            "publication_status": row.status or "draft",
        }
        for row in rows[:page_size]
    ]
    return paginated(items, page=page, page_size=page_size, has_more=len(rows) > page_size, total=total)


async def save_draft(
    db: AsyncSession, actor_id: str, body: CreateContentDraft | UpdateContentDraft, *, draft_id: str | None = None
) -> ContentDraftResponse:
    await require_admin_actor(db, actor_id)
    operation, replayed = await _claim(
        db, actor_id, body.operation_id, "update" if draft_id else "create", draft_id, body.model_dump()
    )
    if replayed:
        return await draft_detail(db, operation.result_refs["draft_id"], replayed=True)
    if draft_id:
        row = await _draft(db, draft_id, lock=True)
        if not isinstance(body, UpdateContentDraft):
            raise AppError(422, "VALIDATION_ERROR", "更新必须提供草稿版本")
        _editable(row, body.expected_version)
        row.version += 1
        row.manifest = copy.deepcopy(body.manifest)
        row.updated_at = datetime.now(UTC)
    else:
        row = TeachingContentDraft(manifest=copy.deepcopy(body.manifest), created_by=actor_id)
        db.add(row)
    await db.flush()
    operation.status, operation.target_id = "completed", row.id
    operation.result_refs = {"draft_id": row.id, "version": row.version}
    await db.flush()
    return await draft_detail(db, row.id)


async def preflight(db: AsyncSession, draft_id: str) -> ContentPreflightResponse:
    row = await _draft(db, draft_id)
    issues = []
    source_check = "not_checked"
    try:
        checked = _validate(row.manifest)
    except AppError as exc:
        issues.append(exc.message)
    else:
        current = await content._current_payload(db, row.manifest.get("question_id", ""))
        source_check = (
            "missing"
            if current is None
            else "matched"
            if content.source_fingerprint(*current) == checked["source_fingerprint"]
            else "changed"
        )
        if source_check != "matched":
            issues.append("候选材料没有匹配的当前题库来源")
    return ContentPreflightResponse.model_validate(
        {
            "structural_checks": "failed" if source_check == "not_checked" else "passed",
            "source_check": source_check,
            "verifier_available": receipt_verifier() is not None,
            "issues": issues,
        }
    )


@dataclass(frozen=True)
class PublicationInput:
    manifest: dict | None


async def publication_input(
    db: AsyncSession, actor_id: str, draft_id: str, body: PublishContentDraft
) -> PublicationInput:
    prior = await _prior(db, actor_id, body.operation_id, _hash("publish", draft_id, body.model_dump()))
    if prior is not None and prior.status == "completed":
        return PublicationInput(None)
    row = await _draft(db, draft_id)
    _editable(row, body.expected_version)
    return PublicationInput(copy.deepcopy(row.manifest))


@dataclass(frozen=True)
class VerifiedManifest:
    manifest_hash: str
    receipt_hashes: frozenset[str]

    async def accepts(self, receipt: dict) -> bool:
        return content.stable_hash(receipt) in self.receipt_hashes


async def verify_publication(value: PublicationInput) -> VerifiedManifest | None:
    """No DB transaction or lock belongs around the remote verifier calls."""
    if value.manifest is None:
        return None
    _validate(value.manifest)
    if not isinstance(value.manifest.get("question_id"), str) or not value.manifest["question_id"]:
        raise AppError(422, "VALIDATION_ERROR", "发布必须绑定当前题库题目")
    verifier = receipt_verifier()
    if verifier is None:
        raise AppError(503, "SERVICE_UNAVAILABLE", "网关核验收据验证器尚未接入，内容保持未发布")
    report = value.manifest["verification_report"]
    receipts = [*report["blind_answers"], *report["teaching_checks"]]
    for receipt in receipts:
        try:
            accepted = await verifier(receipt)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(503, "SERVICE_UNAVAILABLE", "核验服务暂不可用，内容保持未发布") from exc
        if accepted is not True:
            raise AppError(422, "VALIDATION_ERROR", "核验收据无法由服务器验证")
    return VerifiedManifest(content.stable_hash(value.manifest), frozenset(content.stable_hash(r) for r in receipts))


async def publish_verified(
    db: AsyncSession, actor_id: str, draft_id: str, body: PublishContentDraft, proof: VerifiedManifest | None
) -> ContentDraftResponse:
    await require_admin_actor(db, actor_id)
    operation, replayed = await _claim(db, actor_id, body.operation_id, "publish", draft_id, body.model_dump())
    if replayed:
        return await draft_detail(db, operation.result_refs["draft_id"], replayed=True)
    row = await _draft(db, draft_id, lock=True)
    _editable(row, body.expected_version)
    if proof is None or proof.manifest_hash != content.stable_hash(row.manifest):
        raise AppError(409, "CONTENT_REVISION_MISMATCH", "已核验的候选内容发生变化，请重新核验")
    revision = await content.publish_revision(db, row.manifest, verify_receipt=proof.accepts)
    row.published_revision_id, row.updated_at = revision.id, datetime.now(UTC)
    row.version += 1
    operation.status = "completed"
    operation.result_refs = {"draft_id": row.id, "revision_id": revision.id, "version": row.version}
    await db.flush()
    return await draft_detail(db, row.id)


async def import_replayed(db: AsyncSession, actor_id: str, operation_id: str, manifests: list[dict]) -> bool:
    prior = await _prior(
        db,
        actor_id,
        operation_id,
        _hash("import_batch", None, {"manifest_hashes": [content.stable_hash(value) for value in manifests]}),
    )
    return prior is not None and prior.status == "completed"


async def import_verified(
    db: AsyncSession, actor_id: str, operation_id: str, manifests: list[dict], proofs: list[VerifiedManifest | None]
) -> list[ContentDraftResponse]:
    await require_admin_actor(db, actor_id)
    operation, replayed = await _claim(
        db,
        actor_id,
        operation_id,
        "import_batch",
        None,
        {"manifest_hashes": [content.stable_hash(value) for value in manifests]},
    )
    if replayed:
        return [await draft_detail(db, draft_id, replayed=True) for draft_id in operation.result_refs["draft_ids"]]
    results = []
    for index, (manifest, proof) in enumerate(zip(manifests, proofs, strict=True)):
        key = "import:" + content.stable_hash({"operation_id": operation_id, "index": index})[:40]
        draft = await save_draft(db, actor_id, CreateContentDraft(operation_id=key + ":draft", manifest=manifest))
        results.append(
            await publish_verified(
                db, actor_id, draft.id, PublishContentDraft(operation_id=key + ":publish", expected_version=1), proof
            )
        )
    operation.status = "completed"
    operation.result_refs = {"draft_ids": [result.id for result in results]}
    await db.flush()
    return results


async def withdraw(db: AsyncSession, actor_id: str, revision_id: str, body: WithdrawContentRevision) -> dict:
    await require_admin_actor(db, actor_id)
    operation, replayed = await _claim(db, actor_id, body.operation_id, "withdraw", revision_id, body.model_dump())
    row = await db.get(ExamAnalysisRevision, revision_id, with_for_update=True, populate_existing=True)
    if row is None:
        raise AppError(404, "NOT_FOUND", "内容版本不存在")
    if not replayed:
        if row.status != body.expected_status:
            raise AppError(409, "CONTENT_REVISION_MISMATCH", "内容状态已变化，请重新读取")
        row.status = "withdrawn"
        operation.status, operation.reason = "completed", body.reason
        operation.result_refs = {"revision_id": row.id, "status": "withdrawn"}
        await db.flush()
    return {"revision_id": row.id, "status": row.status, "replayed": replayed}


async def audit(
    db: AsyncSession, target_id: str | None, *, page: int, page_size: int, operation_id: str | None = None
) -> dict:
    query = select(ContentPublicationOperation).where(ContentPublicationOperation.status == "completed")
    if target_id is not None:
        query = query.where(ContentPublicationOperation.target_id == target_id)
    if operation_id is not None:
        query = query.where(ContentPublicationOperation.operation_id == operation_id)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = list(
        (
            await db.execute(
                query.order_by(ContentPublicationOperation.created_at.desc(), ContentPublicationOperation.id)
                .offset((page - 1) * page_size)
                .limit(page_size + 1)
            )
        ).scalars()
    )
    items = [
        {
            "id": r.id,
            "actor_id": r.actor_id,
            "operation_id": r.operation_id,
            "action": r.action,
            "result_refs": r.result_refs,
            "reason": r.reason,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows[:page_size]
    ]
    return paginated(items, page=page, page_size=page_size, has_more=len(rows) > page_size, total=total)
