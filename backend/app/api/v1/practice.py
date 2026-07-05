"""Unified practice engine — adaptive drill per exam level.

GET  /api/v1/videos/{video_id}/practice?level=<exam_level>
    Generate adaptive practice items for the given exam level. Item types are
    chosen based on each word's SM-2 mastery level (new→识别, learning→产出,
    reviewing/mastered→语境). All grading is client-side.

POST /api/v1/practice/submit
    Batch-submit practice results and update SM-2 for each word.

PATCH /api/v1/videos/{video_id}/practice
    Owner-only: overwrite cached context_fill questions for a level.

POST /api/v1/videos/{video_id}/practice/regenerate
    Owner-only: AI-regenerate context_fill questions for a level.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.exam_levels import EXAM_LEVEL_KEYS
from app.core.limiter import rate_limit
from app.models.user import User
from app.services import practice_service
from app.services.ai_service import AIServiceError

router = APIRouter(prefix="/videos", tags=["practice"])

DEFAULT_COUNT = 10


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PracticeItem(BaseModel):
    """A single adaptive practice item.

    6 types across 3 categories:
    - recognition: listen_choose_meaning, see_word_choose_meaning
    - production:  see_meaning_spell_word, listen_spell_word
    - context:     context_fill, sentence_repeat
    """

    word: str
    category: Literal["recognition", "production", "context"]
    type: Literal[
        "listen_choose_meaning",
        "see_word_choose_meaning",
        "see_meaning_spell_word",
        "listen_spell_word",
        "context_fill",
        "sentence_repeat",
    ]
    translation: str
    options: list[str] | None = None
    answer: str
    # context_fill
    sentence_template: str | None = None
    # sentence_repeat / audio seek
    start_time: float | None = None
    end_time: float | None = None
    full_sentence: str | None = None
    # metadata
    phonetic: str | None = None


class UnifiedPracticeSet(BaseModel):
    video_id: str
    exam_level: str
    items: list[PracticeItem]


class PracticeResultItem(BaseModel):
    word: str
    correct: bool


class PracticeSubmitRequest(BaseModel):
    results: list[PracticeResultItem]
    video_id: str


class PracticeSubmitResponse(BaseModel):
    updated: int
    auto_added: int


class ContextFillItem(BaseModel):
    """One editable context_fill question (UGC editor)."""

    word: str
    type: Literal["context_fill"] = "context_fill"
    question: str  # sentence_template
    answer: str
    options: list[str] | None = None


class ContextFillEdit(BaseModel):
    """Full replacement payload for a video's context_fill set at a given level."""

    questions: list[ContextFillItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers: map service-layer exceptions → HTTP
# ---------------------------------------------------------------------------


def _raise_for_value_error(exc: ValueError) -> None:
    """Map ValueError from the service layer to the appropriate HTTP error."""
    if "not found" in str(exc):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    raise HTTPException(status_code=409, detail=str(exc)) from exc


def _raise_for_permission_error(exc: PermissionError) -> None:
    """Map PermissionError from the service layer to the appropriate HTTP error."""
    if "无权" in str(exc):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/{video_id}/practice", response_model=UnifiedPracticeSet)
@rate_limit("10/minute")
async def get_practice(
    request: Request,
    video_id: str,
    level: str = Query(..., description="Target exam level key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return adaptive practice items for a video's target-level words.

    Item types are chosen based on each word's SM-2 mastery level.
    Free-tier (not Pro-gated). All grading is client-side.
    """
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(
            status_code=422,
            detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}",
        )

    try:
        items = await practice_service.build_unified_drill(db, video_id, level, current_user)
    except ValueError as e:
        _raise_for_value_error(e)
    except PermissionError as e:
        _raise_for_permission_error(e)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=f"练习题生成失败：{e}") from e

    return UnifiedPracticeSet(
        video_id=video_id,
        exam_level=level,
        items=[PracticeItem(**i) for i in items],
    )


# ---------------------------------------------------------------------------
# SM-2 batch submit
# ---------------------------------------------------------------------------


@router.post("/practice/submit", response_model=PracticeSubmitResponse)
@rate_limit("10/minute")
async def submit_practice_results(
    request: Request,
    body: PracticeSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Batch-submit practice results and update SM-2 for each word.

    Words not yet in the user's vocabulary are auto-added.
    """
    try:
        result = await practice_service.submit_practice_results(
            db,
            current_user.id,
            [r.model_dump() for r in body.results],
            body.video_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交失败：{e}") from e

    return PracticeSubmitResponse(**result)


# ---------------------------------------------------------------------------
# UGC creator endpoints — edit / regenerate context_fill questions.
# ---------------------------------------------------------------------------


@router.patch("/{video_id}/practice", response_model=UnifiedPracticeSet)
@rate_limit("10/minute")
async def edit_practice(
    request: Request,
    video_id: str,
    payload: ContextFillEdit,
    level: str = Query(..., description="Target exam level key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Overwrite cached context_fill questions for a level (owner only)."""
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(
            status_code=422,
            detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}",
        )

    try:
        await practice_service.require_editable_own_video(db, video_id, current_user)
    except PermissionError as e:
        _raise_for_permission_error(e)
    except ValueError as e:
        _raise_for_value_error(e)

    questions_json = [q.model_dump() for q in payload.questions]
    persisted = await practice_service.update_practice_set(db, video_id, level, questions_json)
    return UnifiedPracticeSet(
        video_id=video_id,
        exam_level=level,
        items=[PracticeItem(**q) for q in persisted],
    )


@router.post("/{video_id}/practice/regenerate", response_model=UnifiedPracticeSet)
@rate_limit("5/minute")
async def regenerate_practice(
    request: Request,
    video_id: str,
    level: str = Query(..., description="Target exam level key"),
    count: int = Query(DEFAULT_COUNT, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI-regenerate context_fill questions for a level (owner only)."""
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(
            status_code=422,
            detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}",
        )

    try:
        questions = await practice_service.regenerate_practice_questions(db, video_id, level, count, current_user)
    except ValueError as e:
        _raise_for_value_error(e)
    except PermissionError as e:
        _raise_for_permission_error(e)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=f"练习题生成失败：{e}") from e

    return UnifiedPracticeSet(
        video_id=video_id,
        exam_level=level,
        items=[PracticeItem(**q) for q in questions],
    )
