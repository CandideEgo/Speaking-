"""真题测试 API — past-paper list/detail, attempt lifecycle, daily check.

Endpoints:
  GET  /exams?level=&page=            paper list (with user attempt stats)
  GET  /exams/daily/start?count=       start a random daily check session
  GET  /exams/attempts                 my attempt history
  GET  /exams/attempts/{id}            attempt detail (answers + explanations)
  POST /exams/attempts/{id}/submit     submit answers -> server-side grading
  GET  /exams/{paper_id}               paper detail (questions WITHOUT answers)
  POST /exams/{paper_id}/attempts      start a full-paper attempt

NOTE: no ``from __future__ import annotations`` here on purpose. The
``@rate_limit`` decorator (slowapi) wraps endpoints with functools.wraps, so
FastAPI resolves string annotations against the slowapi module namespace and
body-type annotations would silently become ForwardRefs and crash pydantic.
Keep annotations as runtime-evaluated classes (same as vocabulary.py).

Static paths (/daily/start, /attempts*) must be registered BEFORE the dynamic
/{paper_id} route or FastAPI would match "attempts" as a paper id.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.exam import (
    ExamAttemptCreateResponse,
    ExamPaperDetail,
    ExamQuestionPublic,
    ExamSubmitRequest,
    ExamSubmitResponse,
    WrongRedoRequest,
)
from app.schemas.pagination import paginated
from app.services import exam_service

router = APIRouter(prefix="/exams", tags=["exams"])


def _create_payload(session, questions: list) -> dict:
    return {
        "session_id": session.id,
        "paper_id": session.paper_id,
        "mode": session.mode,
        "question_count": len(questions),
        "questions": [exam_service._question_public(q) for q in questions],
    }


@router.get("")
async def list_exams(
    level: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List past papers, newest first, with the caller's attempt stats."""
    items, total = await exam_service.list_papers(db, current_user.id, level=level, page=page, page_size=page_size)
    return paginated(items=items, total=total, page=page, page_size=page_size)


@router.get("/daily/start", response_model=ExamAttemptCreateResponse)
@rate_limit("20/minute")
async def start_daily_check(
    request: Request,
    count: int = Query(default=10, ge=3, le=20),
    level: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a random daily-check session (10 questions by default).

    ``level`` defaults to the user's target exam level (UserPreferences).
    """
    if not level:
        level = await exam_service.user_target_level(db, current_user.id) or None
    try:
        session, questions = await exam_service.create_daily_session(db, current_user.id, level, count)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return ExamAttemptCreateResponse(**_create_payload(session, questions))


@router.get("/wrong")
async def list_wrong_questions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated wrong-book list (answered-and-wrong only, deduped)."""
    items, total = await exam_service.list_wrong_questions(db, current_user.id, page=page, page_size=page_size)
    return paginated(items=items, total=total, page=page, page_size=page_size)


@router.post("/wrong/redo", response_model=ExamAttemptCreateResponse)
@rate_limit("10/minute")
async def redo_wrong_questions(
    request: Request,
    body: WrongRedoRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a wrong-redo session (all wrong questions, or the given subset)."""
    try:
        session, questions = await exam_service.create_wrong_redo_session(
            db, current_user.id, body.question_ids if body else None
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return ExamAttemptCreateResponse(**_create_payload(session, questions))


@router.get("/stats")
async def get_exam_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Practice-hub headline stats (monthly completions / avg score / daily series)."""
    return await exam_service.exam_stats(db, current_user.id)


@router.get("/attempts")
async def list_attempts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """My attempt history, newest first."""
    items, total = await exam_service.list_attempts(db, current_user.id, page=page, page_size=page_size)
    return paginated(items=items, total=total, page=page, page_size=page_size)


@router.get("/attempts/{session_id}")
async def get_attempt(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Attempt detail — per-question user answer / correctness / explanation."""
    session = await exam_service.get_attempt_detail(db, session_id, current_user.id)
    if session is None:
        raise HTTPException(status_code=404, detail="作答不存在")
    results: list[dict] = []
    for a in sorted(session.answers, key=lambda x: x.question.get("number", 0)):
        q = a.question or {}
        results.append(
            {
                "question_id": a.question_id,
                "number": q.get("number"),
                "section": q.get("section"),
                "question_type": q.get("question_type"),
                "question": q.get("question"),
                "options": q.get("options"),
                "passage": q.get("passage"),
                "user_answer": a.user_answer,
                "correct": a.correct,
                "correct_answer": q.get("answer") if session.submitted_at else None,
                "explanation": q.get("explanation") if session.submitted_at else None,
            }
        )
    return {
        "id": session.id,
        "mode": session.mode,
        "exam_level": session.exam_level,
        "paper_id": session.paper_id,
        "question_count": session.question_count,
        "score": session.score,
        "submitted": session.submitted_at is not None,
        "part_scores": session.part_scores,
        "started_at": session.started_at,
        "submitted_at": session.submitted_at,
        "results": results,
    }


@router.post("/attempts/{session_id}/submit", response_model=ExamSubmitResponse)
@rate_limit("10/minute")
async def submit_attempt(
    request: Request,
    session_id: str,
    body: ExamSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit answers for server-side grading; returns per-question results."""
    session = await exam_service.get_attempt_detail(db, session_id, current_user.id)
    if session is None:
        raise HTTPException(status_code=404, detail="作答不存在")
    try:
        result = await exam_service.submit_answers(db, session, current_user.id, [a.model_dump() for a in body.answers])
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return ExamSubmitResponse(**result)


@router.get("/{paper_id}", response_model=ExamPaperDetail)
async def get_exam_paper(
    paper_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paper detail — questions without answers (answers revealed on submit)."""
    paper = await exam_service.get_paper_with_questions(db, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="试卷不存在")
    questions = sorted(paper.questions, key=lambda q: q.number)
    return ExamPaperDetail(
        id=paper.id,
        level=paper.level,
        year=paper.year,
        month=paper.month,
        set_no=paper.set_no,
        title=paper.title,
        source=paper.source,
        total_questions=paper.total_questions,
        questions=[ExamQuestionPublic(**exam_service._question_public(q)) for q in questions],
    )


@router.post("/{paper_id}/attempts", response_model=ExamAttemptCreateResponse)
@rate_limit("10/minute")
async def create_paper_attempt(
    request: Request,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a full-paper attempt."""
    paper = await exam_service.get_paper_with_questions(db, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="试卷不存在")
    session = await exam_service.create_paper_session(db, current_user.id, paper)
    await db.commit()
    questions = sorted(paper.questions, key=lambda q: q.number)
    return ExamAttemptCreateResponse(**_create_payload(session, questions))
