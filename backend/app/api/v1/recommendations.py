"""Recommendations API — P2 home feed + category feed (ADR-0011).

``GET /recommendations/home`` — page-1 40/30/20/10 mix with diversity + soft
personalization (history-click topic_tags + CEFR level / target_exam band).
Anonymous users get the same mix without personalization; logged-in users get
a per-user cache key. ``GET /recommendations/category/{tag}`` — score-ranked
videos within a topic tag.

See LAUNCH-SPRINT-2026-07 阶段 5.
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_optional_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.services.recommendation_service import get_category_feed, get_home_feed

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/home")
@rate_limit("30/minute")
async def home_feed(
    request: Request,
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(20, ge=4, le=50),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Personalized home feed (40/30/20/10 mix). Anonymous-accessible."""
    return await get_home_feed(db, current_user, page, page_size)


@router.get("/category/{tag}")
@rate_limit("30/minute")
async def category_feed(
    request: Request,
    tag: str,
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(20, ge=4, le=50),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Score-ranked videos within a topic tag, soft-personalized."""
    return await get_category_feed(db, current_user, tag, page, page_size)
