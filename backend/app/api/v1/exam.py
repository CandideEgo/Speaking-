"""Exam system — hub stats, exam sessions with server-side grading, wrong book.

GET  /api/v1/practice/hub
    Practice hub aggregates: monthly/weekly completions, average accuracy,
    last daily-check score, wrong-book size and per-video paper cards.

POST /api/v1/exam/start
    Start an exam session (daily_check | video_exam | wrong_redo). Returns
    answer-stripped questions; answers stay server-side for grading.

POST /api/v1/exam/{session_id}/submit
    Grade the session server-side, return score + per-category breakdown,
    then update SM-2 mastery (reuses practice_service.submit_practice_results).

GET  /api/v1/practice/wrong
    Derived wrong book (wrong answers not yet cleared by a correct redo).

POST /api/v1/practice/wrong/redo
    Start a wrong_redo session over the current wrong book; a correct redo
    clears the word.

GET  /api/v1/videos/{video_id}/paper
    Video paper for the embedded/instant mode. Client-side grading; results
    are submitted via the existing POST /api/v1/videos/practice/submit.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.exam_levels import EXAM_LEVEL_KEYS
from app.core.limiter import rate_limit
from app.models.exam import EXAM_MODES
from app.models.user import User
from app.services import exam_service
from app.services.ai_service import AIServiceError

router = APIRouter(tags=["exam"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ExamStartRequest(BaseModel):
    mode: str = Field(..., description="daily_check | video_exam | wrong_redo")
    level: str | None = Field(None, description="Target exam level key; defaults to user preference")
    video_id: str | None = Field(None, description="Required for video_exam mode")


class ExamAnswerIn(BaseModel):
    id: str
    user_answer: str | None = None


class ExamSubmitRequest(BaseModel):
    answers: list[ExamAnswerIn] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _map_service_errors(e: ValueError | PermissionError) -> None:
    if isinstance(e, PermissionError):
        if "无权" in str(e):
            raise HTTPException(status_code=403, detail=str(e)) from e
        raise HTTPException(status_code=404, detail="Not found") from e
    if "not found" in str(e).lower():
        raise HTTPException(status_code=404, detail=str(e)) from e
    raise HTTPException(status_code=409, detail=str(e)) from e


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/practice/hub")
@rate_limit("30/minute")
async def get_practice_hub(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated practice stats + per-video paper cards for the hub page."""
    return await exam_service.get_practice_hub(db, current_user)


@router.post("/exam/start")
@rate_limit("10/minute")
async def start_exam(
    request: Request,
    body: ExamStartRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start an exam session and return answer-stripped questions."""
    if body.mode not in EXAM_MODES:
        raise HTTPException(status_code=422, detail=f"mode must be one of: {', '.join(EXAM_MODES)}")
    if body.level and body.level not in EXAM_LEVEL_KEYS:
        raise HTTPException(
            status_code=422,
            detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}",
        )

    try:
        return await exam_service.start_exam(db, current_user, body.mode, body.level, body.video_id)
    except PermissionError as e:
        _map_service_errors(e)
    except ValueError as e:
        _map_service_errors(e)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=f"题目生成失败：{e}") from e


@router.post("/exam/{session_id}/submit")
@rate_limit("10/minute")
async def submit_exam(
    request: Request,
    session_id: str,
    body: ExamSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Grade the session server-side and return score + breakdown."""
    try:
        return await exam_service.submit_exam(db, current_user, session_id, [a.model_dump() for a in body.answers])
    except PermissionError as e:
        _map_service_errors(e)
    except ValueError as e:
        _map_service_errors(e)


@router.get("/practice/wrong")
@rate_limit("30/minute")
async def get_wrong_book(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Derived wrong book: wrong answers not yet cleared by a correct redo."""
    items = await exam_service.get_wrong_items(db, current_user)
    # Strip the full question snapshot from the list view.
    return {
        "count": len(items),
        "items": [
            {
                "word": it["word"],
                "category": it["category"],
                "type": it["type"],
                "stem": it["stem"],
                "from": it["from"],
                "answered_at": it["answered_at"],
            }
            for it in items
        ],
    }


@router.post("/practice/wrong/redo")
@rate_limit("10/minute")
async def redo_wrong_book(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a wrong_redo session over the current wrong book."""
    try:
        return await exam_service.start_exam(db, current_user, "wrong_redo")
    except ValueError as e:
        _map_service_errors(e)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=f"题目生成失败：{e}") from e


@router.get("/videos/{video_id}/paper")
@rate_limit("10/minute")
async def get_video_paper(
    request: Request,
    video_id: str,
    level: str = Query(..., description="Target exam level key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Video paper for the instant mode (client-side grading)."""
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(
            status_code=422,
            detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}",
        )
    try:
        return await exam_service.get_video_paper(db, current_user, video_id, level)
    except PermissionError as e:
        _map_service_errors(e)
    except ValueError as e:
        _map_service_errors(e)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=f"题目生成失败：{e}") from e
