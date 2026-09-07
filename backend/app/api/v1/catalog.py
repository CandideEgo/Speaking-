"""Admin catalog API — candidate pool for curated video ingestion.

All endpoints are admin-only under ``/api/v1/admin/catalog``. The catalog stages
scraped/discovered video candidates; admins promote them one at a time into the
official-video pipeline ("process one, publish one"). See catalog_service.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.catalog import (
    CatalogItemResponse,
    CatalogMarkRequest,
    CatalogPromoteRequest,
    CatalogSummaryResponse,
)
from app.schemas.pagination import PaginatedResponse
from app.services import catalog_service

router = APIRouter(prefix="/admin/catalog", tags=["admin-catalog"])


@router.get("", response_model=PaginatedResponse)
@rate_limit("60/minute")
async def list_catalog(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(
        None, alias="status", description="new/queued/processing/published/skipped/error"
    ),
    source: str | None = Query(None, description="Provenance filter, e.g. languagereactor"),
    channel: str | None = Query(None, description="Filter by upstream channel name (contains)"),
    sort: str = Query("fit", description="fit | views | date | duration | recent"),
    min_duration: int | None = Query(None, ge=0, description="Min duration in seconds"),
    max_duration: int | None = Query(None, ge=0, description="Max duration in seconds"),
    keyword: str | None = Query(None, description="Search title (contains)"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List catalog candidates (default order: SeeWord-fit score, best first)."""
    return await catalog_service.list_items(
        db,
        page=page,
        page_size=page_size,
        status=status_filter,
        source=source,
        channel=channel,
        sort=sort,
        min_duration=min_duration,
        max_duration=max_duration,
        keyword=keyword,
    )


@router.get("/summary", response_model=CatalogSummaryResponse)
@rate_limit("60/minute")
async def catalog_summary(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Pool totals broken down by status and source."""
    return await catalog_service.summary(db)


@router.get("/{item_id}", response_model=CatalogItemResponse)
@rate_limit("60/minute")
async def get_catalog_item(
    request: Request,
    item_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Single candidate with its live promoted-video status."""
    try:
        return await catalog_service.get_item_response(db, item_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.post("/{item_id}/promote", response_model=CatalogItemResponse)
@rate_limit("10/minute")
async def promote_catalog_item(
    request: Request,
    item_id: str,
    payload: CatalogPromoteRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Promote a candidate into the official-video pipeline (download + process).

    Reuses the existing seed path; ``auto_publish=True`` publishes automatically
    once the pipeline reaches ready (mirrors ``/videos/seed-full``).
    """
    try:
        return await catalog_service.promote_item(db, item_id, auto_publish=payload.auto_publish)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.patch("/{item_id}", response_model=CatalogItemResponse)
@rate_limit("30/minute")
async def mark_catalog_item(
    request: Request,
    item_id: str,
    payload: CatalogMarkRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Set a curation state (new/queued/skipped) + optional admin notes."""
    try:
        return await catalog_service.mark_item(db, item_id, payload.status, payload.admin_notes)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e
