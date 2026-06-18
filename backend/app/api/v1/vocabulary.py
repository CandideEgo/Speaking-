"""Vocabulary route handlers — thin HTTP layer only.

All business logic lives in app.services.vocabulary_service.
These handlers parse requests, call the service, and return responses.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.api.dependencies import get_current_user
from app.core.limiter import rate_limit
from app.services.vocabulary_service import (
    add_word as _add_word,
    list_vocabulary as _list_vocabulary,
    review_word as _review_word,
    remove_word as _remove_word,
)

router = APIRouter(prefix="/vocabulary", tags=["vocabulary"])


@router.post("", status_code=status.HTTP_201_CREATED)
@rate_limit("10/minute")
async def add_word(
    request: Request,
    word: str,
    context_sentence: str | None = None,
    video_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a word to personal vocabulary."""
    try:
        return await _add_word(db, current_user.id, word, context_sentence, video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
@rate_limit("30/minute")
async def list_vocabulary(
    request: Request,
    due_only: bool = Query(False, description="Only show words due for review"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List vocabulary words. Optionally filter to only due words."""
    return await _list_vocabulary(db, current_user.id, due_only, page, page_size)


@router.post("/{word_id}/review")
@rate_limit("10/minute")
async def review_word(
    request: Request,
    word_id: str,
    quality: int = Query(..., ge=0, le=5, description="Self-assessment 0-5"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a review of a word with SM-2 spaced repetition."""
    try:
        return await _review_word(db, word_id, current_user.id, quality)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{word_id}")
@rate_limit("10/minute")
async def remove_word(
    request: Request,
    word_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a word from vocabulary."""
    try:
        await _remove_word(db, word_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"success": True}
