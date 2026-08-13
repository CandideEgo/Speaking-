"""真题测试 (past-paper exam) service — sessions, grading, daily check.

Owns the attempt lifecycle:
  * ``create_paper_session``   — start a full-paper attempt (mode=paper_exam)
  * ``create_daily_session``   — start a random daily check (mode=daily_check)
  * ``create_wrong_redo_session`` — start a wrong-book redo (mode=wrong_redo)
  * ``submit_answers``         — server-side grading, freezes question
    snapshots into exam_answers, computes score + per-section breakdown, and
    emits a LearningEvent (practiced_items) so the daily plan / profile
    pipelines see the activity.
  * ``list_wrong_questions``   — aggregated wrong-book view (derived query,
    no extra table)
  * ``exam_stats``             — practice-hub headline stats

Grading rule: user choice must exactly match the stored answer letter
(case-insensitive). Unanswered questions count as wrong.
"""

from __future__ import annotations

import logging
import random
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.exam_test import ExamAnswer, ExamPaper, ExamQuestion, ExamSession
from app.models.preferences import UserPreferences
from app.models.user import User

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MODE_PAPER = "paper_exam"
MODE_DAILY = "daily_check"
MODE_WRONG = "wrong_redo"

# Section display order in results.
SECTION_ORDER = ("reading_A", "reading_B", "reading_C")

DAILY_QUESTION_COUNT = 10


def _now() -> datetime:
    return datetime.now(UTC)


def _as_naive_utc(dt: datetime | None) -> datetime | None:
    """Normalize DB datetimes to naive UTC.

    PostgreSQL returns timezone-aware datetimes while the test SQLite returns
    naive ones; both must compare/sort consistently with the naive-UTC
    boundaries computed in this module.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


async def get_paper_with_questions(db: AsyncSession, paper_id: str) -> ExamPaper | None:
    stmt = select(ExamPaper).where(ExamPaper.id == paper_id).options(selectinload(ExamPaper.questions))
    return (await db.execute(stmt)).scalar_one_or_none()


def _question_public(q: ExamQuestion) -> dict:
    """Public question payload — deliberately excludes answer/explanation."""
    return {
        "id": q.id,
        "number": q.number,
        "section": q.section,
        "question_type": q.question_type,
        "passage": q.passage,
        "question": q.question,
        "options": q.options,
    }


def _snapshot_question(q: ExamQuestion) -> dict:
    """Frozen question snapshot stored on exam_answers (includes answer)."""
    return {
        "id": q.id,
        "number": q.number,
        "section": q.section,
        "question_type": q.question_type,
        "passage": q.passage,
        "question": q.question,
        "options": q.options,
        "answer": q.answer,
        "explanation": q.explanation,
    }


async def create_paper_session(db: AsyncSession, user_id: str, paper: ExamPaper) -> ExamSession:
    """Create a full-paper attempt session."""
    session = ExamSession(
        user_id=user_id,
        mode=MODE_PAPER,
        exam_level=paper.level,
        paper_id=paper.id,
        question_count=paper.total_questions,
        started_at=_now(),
    )
    db.add(session)
    await db.flush()
    return session


async def create_daily_session(
    db: AsyncSession, user_id: str, level: str | None, count: int = DAILY_QUESTION_COUNT
) -> tuple[ExamSession, list[ExamQuestion]]:
    """Create a daily-check session with random questions from the bank.

    ``level`` filters by the user's target exam when given; falls back to any
    available level otherwise. Random selection without repetition.
    """
    stmt = select(ExamQuestion)
    if level:
        stmt = stmt.join(ExamQuestion.paper).where(ExamPaper.level == level)
    pool = (await db.execute(stmt)).scalars().all()
    if not pool:
        # Level filter matched nothing (e.g. user target_exam has no bank yet):
        # fall back to any available question so the daily check still works.
        pool = (await db.execute(select(ExamQuestion))).scalars().all()
    if not pool:
        raise ValueError("题库为空，请先导入真题")
    picked = random.sample(pool, min(count, len(pool)))
    # Keep paper grouping so the same paper's passages stay together for reading.
    picked.sort(key=lambda q: (q.paper_id, q.number))

    session = ExamSession(
        user_id=user_id,
        mode=MODE_DAILY,
        exam_level=level,
        paper_id=None,
        question_count=len(picked),
        started_at=_now(),
    )
    db.add(session)
    await db.flush()
    # Fix the session's question set NOW via placeholder ExamAnswer rows
    # (answered_at=None). Binding submission to exactly these questions is
    # required — otherwise a client could submit arbitrary question ids and
    # read the correct answers back from the grading response (answer
    # enumeration / score manipulation).
    for q in picked:
        db.add(
            ExamAnswer(
                session_id=session.id,
                question_id=q.id,
                question=_snapshot_question(q),
                answered_at=None,
            )
        )
    return session, picked


async def _graded_answer_rows(db: AsyncSession, user_id: str) -> list[ExamAnswer]:
    """All answered rows across the user's submitted attempts, newest first."""
    rows = (
        await db.execute(
            select(ExamAnswer)
            .join(ExamSession, ExamAnswer.session_id == ExamSession.id)
            .where(
                ExamSession.user_id == user_id,
                ExamSession.submitted_at.is_not(None),
                ExamAnswer.user_answer.is_not(None),
                ExamAnswer.question_id.is_not(None),
            )
            .order_by(ExamAnswer.answered_at.desc())
        )
    ).scalars()
    return list(rows)


def _aggregate_by_question(rows: list[ExamAnswer]) -> dict[str, dict]:
    """Latest graded answer + wrong count per question.

    A question is in the wrong book when its most recent graded answer is
    wrong — answering it correctly later (e.g. a wrong-redo pass) clears it.
    """
    latest: dict[str, ExamAnswer] = {}
    wrong_counts: dict[str, int] = {}
    for answer in rows:
        qid = answer.question_id or ""
        if answer.correct is False:
            wrong_counts[qid] = wrong_counts.get(qid, 0) + 1
        if qid not in latest:
            latest[qid] = answer
    return {"latest": latest, "wrong_counts": wrong_counts}


async def list_wrong_questions(
    db: AsyncSession,
    user_id: str,
    page: int = 1,
    page_size: int = 10,
) -> tuple[list[dict], int]:
    """Aggregate the user's wrong book (derived query, no extra table).

    One row per question whose most recent graded answer is wrong, with
    ``wrong_count`` and the source paper's title/level. Only answered rows
    count; unanswered questions are excluded.
    """
    agg = _aggregate_by_question(await _graded_answer_rows(db, user_id))
    latest = {qid: a for qid, a in agg["latest"].items() if a.correct is False}

    question_ids = list(latest.keys())
    papers: dict[str, ExamPaper] = {}
    if question_ids:
        paper_rows = (
            await db.execute(
                select(ExamQuestion.id, ExamPaper)
                .join(ExamPaper, ExamQuestion.paper_id == ExamPaper.id)
                .where(ExamQuestion.id.in_(question_ids))
            )
        ).all()
        papers = {qid: paper for qid, paper in paper_rows}

    items: list[dict] = []
    for qid, answer in latest.items():
        snap = answer.question or {}
        paper = papers.get(qid)
        items.append(
            {
                "question_id": qid,
                "number": snap.get("number"),
                "section": snap.get("section"),
                "question_type": snap.get("question_type"),
                "passage": snap.get("passage"),
                "question": snap.get("question"),
                "options": snap.get("options"),
                "wrong_count": agg["wrong_counts"].get(qid, 1),
                "last_wrong_at": answer.answered_at,
                "paper_id": paper.id if paper else None,
                "paper_title": paper.title if paper else None,
                "level": paper.level if paper else None,
                "year": paper.year if paper else None,
                "month": paper.month if paper else None,
            }
        )

    # Most recent wrong first, then by paper question number.
    items.sort(
        key=lambda x: (
            _as_naive_utc(x["last_wrong_at"]) or datetime.min,
            -(x["number"] or 0),
        ),
        reverse=True,
    )
    total = len(items)
    start = (page - 1) * page_size
    return items[start : start + page_size], total


async def create_wrong_redo_session(
    db: AsyncSession,
    user_id: str,
    question_ids: list[str] | None = None,
) -> tuple[ExamSession, list[ExamQuestion]]:
    """Start a wrong-book redo session over the user's wrong questions.

    ``question_ids`` restricts the set (e.g. retry one attempt's wrong
    questions); when omitted every aggregated wrong question is included.
    Mirrors ``create_daily_session``: question set locked via placeholder
    ExamAnswer rows so submissions can't enumerate arbitrary ids.
    """
    agg = _aggregate_by_question(await _graded_answer_rows(db, user_id))
    wrong_ids = sorted(qid for qid, a in agg["latest"].items() if a.correct is False)
    if question_ids:
        allowed = set(question_ids)
        wrong_ids = [qid for qid in wrong_ids if qid in allowed]
    if not wrong_ids:
        raise ValueError("暂无错题可重做")

    questions = list((await db.execute(select(ExamQuestion).where(ExamQuestion.id.in_(wrong_ids)))).scalars())
    questions.sort(key=lambda q: (q.paper_id, q.number))

    session = ExamSession(
        user_id=user_id,
        mode=MODE_WRONG,
        exam_level=None,
        paper_id=None,
        question_count=len(questions),
        started_at=_now(),
    )
    db.add(session)
    await db.flush()
    for q in questions:
        db.add(
            ExamAnswer(
                session_id=session.id,
                question_id=q.id,
                question=_snapshot_question(q),
                answered_at=None,
            )
        )
    return session, questions


async def exam_stats(db: AsyncSession, user_id: str) -> dict:
    """Practice-hub headline stats.

    ``month_completed`` / ``avg_score`` cover this calendar month's submitted
    attempts; ``last_daily_score`` / ``week_daily_count`` cover the daily
    check series (any time / last 7 days).
    """
    now = _as_naive_utc(_now())
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)

    submitted = list(
        (
            await db.execute(
                select(ExamSession).where(
                    ExamSession.user_id == user_id,
                    ExamSession.submitted_at.is_not(None),
                )
            )
        ).scalars()
    )

    month_sessions = [s for s in submitted if _as_naive_utc(s.submitted_at) >= month_start]
    avg_score = None
    if month_sessions:
        avg_score = round(sum(s.score or 0 for s in month_sessions) / len(month_sessions), 4)

    daily = [s for s in submitted if s.mode == MODE_DAILY]
    week_daily_count = sum(1 for s in daily if _as_naive_utc(s.submitted_at) >= week_start)
    last_daily = max(
        daily,
        key=lambda s: _as_naive_utc(s.submitted_at) or datetime.min,
        default=None,
    )

    return {
        "month_completed": len(month_sessions),
        "avg_score": avg_score,
        "last_daily_score": last_daily.score if last_daily else None,
        "week_daily_count": week_daily_count,
    }


async def submit_answers(
    db: AsyncSession,
    session: ExamSession,
    user_id: str,
    answers: list[dict],
) -> dict:
    """Grade a session's answers and freeze per-question snapshots.

    ``answers`` is a list of {question_id, answer}. The session must belong to
    ``user_id`` and not be submitted yet. Returns the grading payload:
    {score, correct_count, total, part_scores, results}.
    """
    if session.user_id != user_id:
        raise PermissionError("不是本人的作答")
    if session.submitted_at is not None:
        raise ValueError("该作答已提交")

    # Load the questions for this session (paper questions or daily picks).
    if session.paper_id is not None:
        paper = await get_paper_with_questions(db, session.paper_id)
        questions: list[ExamQuestion] = sorted(paper.questions, key=lambda q: q.number) if paper else []
    else:
        # Daily check: the question set was fixed at session creation via
        # placeholder ExamAnswer rows (answered_at=None). Recovering it from
        # the submitted payload instead would let a client submit arbitrary
        # question ids — extracting answers from the grading response and
        # manipulating scores. Require an exact match on the placeholder set.
        placeholders = {a.question_id: a for a in session.answers if a.question_id}
        submitted_ids = [a.get("question_id") for a in answers]
        if set(submitted_ids) != set(placeholders) or len(submitted_ids) != len(placeholders):
            raise ValueError("作答题目与本次抽题不一致，请重新开始")
        questions = list((await db.execute(select(ExamQuestion).where(ExamQuestion.id.in_(submitted_ids)))).scalars())
        questions.sort(key=lambda q: q.number)

    if not questions:
        raise ValueError("作答题目不存在")

    ans_map: dict[str, str] = {}
    for a in answers:
        qid = a.get("question_id") or ""
        val = str(a.get("answer") or "").strip().upper()
        if qid:
            ans_map[qid] = val

    results: list[dict] = []
    part: dict[str, dict[str, int]] = {}
    correct_count = 0
    now = _now()

    for q in questions:
        user_answer = ans_map.get(q.id, "")
        is_correct = bool(user_answer) and user_answer == q.answer.upper()
        if is_correct:
            correct_count += 1
        part.setdefault(q.section, {"correct": 0, "total": 0})
        part[q.section]["total"] += 1
        if is_correct:
            part[q.section]["correct"] += 1

        if session.paper_id is not None:
            db.add(
                ExamAnswer(
                    session_id=session.id,
                    question_id=q.id,
                    question=_snapshot_question(q),
                    user_answer=user_answer or None,
                    correct=is_correct,
                    answered_at=now,
                )
            )
        else:
            # Daily check: fill in the pre-inserted placeholder row instead
            # of adding a new one (the placeholder IS the question-set lock).
            row = placeholders[q.id]
            row.user_answer = user_answer or None
            row.correct = is_correct
            row.answered_at = now
        results.append(
            {
                "question_id": q.id,
                "number": q.number,
                "section": q.section,
                "question_type": q.question_type,
                "question": q.question,
                "options": q.options,
                "passage": q.passage,
                "user_answer": user_answer or None,
                "correct": is_correct,
                "correct_answer": q.answer,
                "explanation": q.explanation,
            }
        )

    total = len(questions)
    score = round(correct_count / total, 4) if total else 0.0
    session.submitted_at = now
    session.score = score
    session.part_scores = {
        sec: {"correct": part[sec]["correct"], "total": part[sec]["total"]} for sec in SECTION_ORDER if sec in part
    }
    await db.flush()
    await db.commit()

    # Non-blocking LearningEvent emission (ADR-0012 integration).
    try:
        from app.services.learning_event_service import EVENT_PRACTICED_ITEMS, emit_event

        await emit_event(db, user_id, EVENT_PRACTICED_ITEMS, total, video_id=None)
        await db.commit()
    except Exception:
        logger.exception("Failed to emit learning event for exam session %s", session.id)

    return {
        "session_id": session.id,
        "mode": session.mode,
        "score": score,
        "correct_count": correct_count,
        "total": total,
        "part_scores": session.part_scores or {},
        "results": results,
    }


async def list_papers(
    db: AsyncSession,
    user_id: str,
    level: str | None = None,
    page: int = 1,
    page_size: int = 12,
) -> tuple[list[dict], int]:
    """List papers (newest first) with the current user's attempt stats."""
    stmt = select(ExamPaper)
    count_stmt = select(func.count()).select_from(ExamPaper)
    if level:
        stmt = stmt.where(ExamPaper.level == level)
        count_stmt = count_stmt.where(ExamPaper.level == level)
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.order_by(ExamPaper.year.desc(), ExamPaper.month.desc(), ExamPaper.set_no.asc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    papers = (await db.execute(stmt)).scalars().all()

    paper_ids = [p.id for p in papers]
    attempts: list[ExamSession] = []
    if paper_ids:
        attempts = list(
            (
                await db.execute(
                    select(ExamSession).where(
                        ExamSession.user_id == user_id,
                        ExamSession.paper_id.in_(paper_ids),
                        ExamSession.submitted_at.is_not(None),
                    )
                )
            ).scalars()
        )

    by_paper: dict[str, list[ExamSession]] = {}
    for a in attempts:
        by_paper.setdefault(a.paper_id or "", []).append(a)

    items: list[dict] = []
    for p in papers:
        mine = by_paper.get(p.id, [])
        last = mine[-1] if mine else None  # insertion order == started order
        best = max((a.score or 0) for a in mine) if mine else None
        items.append(
            {
                "id": p.id,
                "level": p.level,
                "year": p.year,
                "month": p.month,
                "set_no": p.set_no,
                "title": p.title,
                "source": p.source,
                "total_questions": p.total_questions,
                "last_score": last.score if last else None,
                "last_submitted_at": last.submitted_at if last else None,
                "attempt_count": len(mine),
                "best_score": best,
            }
        )
    return items, total


async def get_attempt_detail(db: AsyncSession, session_id: str, user_id: str) -> ExamSession | None:
    stmt = (
        select(ExamSession)
        .where(ExamSession.id == session_id, ExamSession.user_id == user_id)
        .options(selectinload(ExamSession.answers))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_attempts(
    db: AsyncSession,
    user_id: str,
    page: int = 1,
    page_size: int = 10,
) -> tuple[list[dict], int]:
    """List the user's attempts (newest first) with paper titles."""
    count_stmt = select(func.count()).select_from(ExamSession).where(ExamSession.user_id == user_id)
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = (
        select(ExamSession)
        .where(ExamSession.user_id == user_id)
        .order_by(ExamSession.started_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    sessions = (await db.execute(stmt)).scalars().all()

    paper_ids = [s.paper_id for s in sessions if s.paper_id]
    titles: dict[str, str] = {}
    if paper_ids:
        rows = (await db.execute(select(ExamPaper.id, ExamPaper.title).where(ExamPaper.id.in_(paper_ids)))).all()
        titles = {r[0]: r[1] for r in rows}

    items: list[dict] = []
    for s in sessions:
        duration = 0
        if s.submitted_at and s.started_at:
            duration = max(int((s.submitted_at - s.started_at).total_seconds()), 0)
        items.append(
            {
                "id": s.id,
                "mode": s.mode,
                "exam_level": s.exam_level,
                "paper_id": s.paper_id,
                "paper_title": titles.get(s.paper_id or "") if s.paper_id else None,
                "question_count": s.question_count,
                "score": s.score,
                "correct_count": int((s.score or 0) * s.question_count) if s.submitted_at else None,
                "duration_sec": duration,
                "started_at": s.started_at,
                "submitted_at": s.submitted_at,
            }
        )
    return items, total


async def user_target_level(db: AsyncSession, user_id: str) -> str | None:
    """The user's target exam level from UserPreferences (no lazy-load)."""
    prefs = (await db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id))).scalar_one_or_none()
    return prefs.target_exam if prefs and prefs.target_exam else None
