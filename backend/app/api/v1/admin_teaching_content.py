"""Admin-only publication API. Request transactions end before receipt I/O."""

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.content_publication import (
    ContentDraftResponse,
    ContentDraftSummary,
    ContentPreflightResponse,
    CreateContentDraft,
    PublishContentDraft,
    UpdateContentDraft,
    WithdrawContentResponse,
    WithdrawContentRevision,
)
from app.schemas.pagination import PaginatedResponse
from app.services.teaching import publication

router = APIRouter(
    prefix="/admin/teaching-content", tags=["admin teaching content"], dependencies=[Depends(get_admin_user)]
)


@router.get("/drafts", response_model=PaginatedResponse[ContentDraftSummary])
@rate_limit("60/minute")
async def list_drafts(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await publication.list_drafts(db, page=page, page_size=page_size)


@router.post("/drafts", response_model=ContentDraftResponse, status_code=201)
@rate_limit("20/minute")
async def create_draft(
    request: Request,
    response: Response,
    body: CreateContentDraft,
    user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await publication.save_draft(db, user.id, body)
    await db.commit()
    if result.replayed:
        response.status_code = 200
    return result


@router.get("/drafts/{draft_id}", response_model=ContentDraftResponse)
@rate_limit("60/minute")
async def get_draft(request: Request, response: Response, draft_id: str, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return await publication.draft_detail(db, draft_id)


@router.put("/drafts/{draft_id}", response_model=ContentDraftResponse)
@rate_limit("30/minute")
async def update_draft(
    request: Request,
    draft_id: str,
    body: UpdateContentDraft,
    user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await publication.save_draft(db, user.id, body, draft_id=draft_id)
    await db.commit()
    return result


@router.get("/drafts/{draft_id}/preflight", response_model=ContentPreflightResponse)
@rate_limit("30/minute")
async def preflight(request: Request, draft_id: str, db: AsyncSession = Depends(get_db)):
    return await publication.preflight(db, draft_id)


@router.post("/drafts/{draft_id}/publish", response_model=ContentDraftResponse)
@rate_limit("10/minute")
async def publish(
    request: Request,
    draft_id: str,
    body: PublishContentDraft,
    user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    actor_id = user.id
    value = await publication.publication_input(db, actor_id, draft_id, body)
    await db.rollback()  # Release the read transaction before authenticated receipt I/O.
    proof = await publication.verify_publication(value)
    result = await publication.publish_verified(db, actor_id, draft_id, body, proof)
    await db.commit()
    return result


@router.post("/revisions/{revision_id}/withdraw", response_model=WithdrawContentResponse)
@rate_limit("20/minute")
async def withdraw(
    request: Request,
    revision_id: str,
    body: WithdrawContentRevision,
    user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await publication.withdraw(db, user.id, revision_id, body)
    await db.commit()
    return result


@router.get("/operations")
@rate_limit("60/minute")
async def audit(
    request: Request,
    target_id: str | None = Query(None, min_length=1, max_length=36),
    operation_id: str | None = Query(None, min_length=1, max_length=64),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await publication.audit(db, target_id, page=page, page_size=page_size, operation_id=operation_id)
