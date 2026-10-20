"""A read-only daily preview, followed by an explicit, bound attempt start."""

import hashlib
import json
import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import BadRequestError, NotFoundError
from app.models.exam_test import ExamAnswer, ExamPaper, ExamQuestion, ExamSession
from app.models.user import User
from app.services import exam_service


def _fingerprint(questions: list[ExamQuestion]) -> str:
    snapshots = [exam_service._snapshot_question(q) for q in questions]
    return hashlib.sha256(json.dumps(snapshots, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def complete_question_groups(questions: list[ExamQuestion]) -> list[list[ExamQuestion]]:
    groups: dict[tuple, list[ExamQuestion]] = {}
    for question in questions:
        key = (question.paper_id, question.section, question.passage or question.id)
        groups.setdefault(key, []).append(question)
    return [
        sorted(items, key=lambda q: q.number)
        for items in groups.values()
        if len(exam_service._answerable_questions(items)) == len(items)
    ]


async def summary(db: AsyncSession, user: User) -> dict:
    questions = list((await db.execute(select(ExamQuestion))).scalars().all())
    groups = complete_question_groups(questions)
    types = {kind: {"group_count": 0, "question_count": 0} for kind in ("reading", "matching", "cloze")}
    for group in groups:
        kind = group[0].question_type
        if kind in types:
            types[kind]["group_count"] += 1
            types[kind]["question_count"] += len(group)
    sessions = (
        (
            await db.execute(
                select(ExamSession)
                .where(ExamSession.user_id == user.id, ExamSession.submitted_at.is_not(None))
                .order_by(ExamSession.submitted_at.desc())
                .limit(3)
            )
        )
        .scalars()
        .all()
    )
    papers = {
        p.id: p
        for p in (
            await db.execute(select(ExamPaper).where(ExamPaper.id.in_([s.paper_id for s in sessions if s.paper_id])))
        )
        .scalars()
        .all()
    }
    return {
        "types": types,
        "recent": [
            {
                "id": s.id,
                "title": papers[s.paper_id].title if s.paper_id in papers else "阅读练习",
                "correct": sum(part.get("correct", 0) for part in (s.part_scores or {}).values()),
                "total": s.question_count,
                "submitted_at": s.submitted_at,
            }
            for s in sessions
        ],
    }


async def preview(db: AsyncSession, user: User, variant: int = 0, question_type: str | None = None) -> dict:
    target = await exam_service.user_target_level(db, user.id)
    latest = (
        await db.execute(
            select(ExamSession)
            .where(ExamSession.user_id == user.id, ExamSession.submitted_at.is_not(None))
            .order_by(ExamSession.submitted_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    wrong_types: Counter = Counter()
    if latest:
        answers = (
            (
                await db.execute(
                    select(ExamAnswer).where(ExamAnswer.session_id == latest.id, ExamAnswer.correct.is_(False))
                )
            )
            .scalars()
            .all()
        )
        wrong_types.update(a.question.get("question_type", "reading") for a in answers)
    rows = (
        await db.execute(
            select(ExamQuestion, ExamPaper)
            .join(ExamPaper)
            .order_by(ExamPaper.year.desc(), ExamPaper.month.desc(), ExamPaper.id, ExamQuestion.number)
        )
    ).all()
    papers = {p.id: p for _, p in rows}
    groups = complete_question_groups([q for q, _ in rows])
    if not groups:
        raise NotFoundError("题库暂时没有可练习的完整题组，请稍后再来")
    target_groups = [g for g in groups if papers[g[0].paper_id].level == target]
    preferred = question_type or (wrong_types.most_common(1)[0][0] if wrong_types else None)
    preferred_groups = [g for g in groups if g[0].question_type == preferred] if preferred else []
    if question_type and not preferred_groups:
        raise NotFoundError("当前题库暂无这类完整题组，可以先选择其他题型")
    # Recent mistakes choose the type first; the target exam breaks ties within it.
    candidates = (
        [g for g in preferred_groups if papers[g[0].paper_id].level == target] or preferred_groups
        if preferred_groups
        else target_groups or groups
    )
    chosen = candidates[variant % len(candidates)]
    paper = papers[chosen[0].paper_id]
    labels = {"reading": "仔细阅读", "matching": "长篇匹配", "cloze": "选词填空"}
    reason = (
        f"最近一次练习在{labels.get(preferred, preferred)}的错题较多，推荐练习同类题。"
        if preferred and chosen[0].question_type == preferred
        else "根据你的目标考试，从现有真题中选择完整题组。"
    )
    if not target_groups:
        reason = "所选目标暂无题库，推荐一组现有真题。" if target else "从现有真题中选择一组，随时可以换。"
    if question_type:
        reason = f"按你选择的{labels.get(question_type, question_type)}，选取一组完整真题。"
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": user.id,
            "type": "daily_preview",
            "jti": str(uuid.uuid4()),
            "question_ids": [q.id for q in chosen],
            "fingerprint": _fingerprint(chosen),
            "exp": now + timedelta(minutes=30),
        },
        get_settings().jwt_secret,
        algorithm="HS256",
    )
    return {
        "token": token,
        "title": paper.title,
        "level": paper.level,
        "reason": reason,
        "question_type": chosen[0].question_type,
        "question_count": len(chosen),
        "group_count": len(candidates),
        "variant": variant,
        "passage": chosen[0].passage,
    }


async def start(db: AsyncSession, user: User, token: str) -> tuple[ExamSession, list[dict]]:
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "type", "jti", "exp", "question_ids", "fingerprint"]},
        )
    except jwt.InvalidTokenError as exc:
        raise BadRequestError("推荐已过期，请重新获取一组") from exc
    if payload["sub"] != user.id or payload["type"] != "daily_preview":
        raise BadRequestError("推荐无效，请重新获取")
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    existing = await db.get(ExamSession, payload["jti"])
    if existing:
        if existing.user_id != user.id or existing.submitted_at is not None:
            raise BadRequestError("本组已经提交，请重新获取推荐")
        snapshots = list((await db.execute(select(ExamAnswer).where(ExamAnswer.session_id == existing.id))).scalars())
        return existing, sorted([a.question for a in snapshots], key=lambda q: q["number"])
    questions = list(
        (
            await db.execute(
                select(ExamQuestion).where(ExamQuestion.id.in_(payload["question_ids"])).order_by(ExamQuestion.number)
            )
        )
        .scalars()
        .all()
    )
    if (
        len(questions) != len(payload["question_ids"])
        or not questions
        or _fingerprint(questions) != payload["fingerprint"]
    ):
        raise NotFoundError("题库已更新，请重新获取推荐")
    paper = await db.get(ExamPaper, questions[0].paper_id)
    session = ExamSession(
        id=payload["jti"],
        user_id=user.id,
        mode="daily_check",
        question_count=len(questions),
        # A paper_id denotes a full-paper attempt in the existing scorer.
        # Daily groups must use the bound ExamAnswer rows instead.
        paper_id=None,
        exam_level=paper.level if paper else None,
        started_at=datetime.now(UTC),
    )
    db.add(session)
    await db.flush()
    for question in questions:
        db.add(
            ExamAnswer(
                session_id=session.id,
                question_id=question.id,
                question=exam_service._snapshot_question(question),
                answered_at=None,
            )
        )
    await db.flush()
    return session, [exam_service._snapshot_question(q) for q in questions]
