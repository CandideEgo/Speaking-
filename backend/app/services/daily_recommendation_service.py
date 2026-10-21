"""A read-only daily preview, followed by an explicit, bound attempt start.

题库规模说明（这是本模块的设计前提）：生产题库 159 套 / 5235 道题，其中
``passage`` 原文合计 **16.4 MB**。``/discovery/daily`` 与
``/discovery/practice-summary`` 都在**用户请求路径**上，若每次都把整库题面读进
内存分组，就是每个请求搬 16 MB（限流 30/min，足够打垮一台机器）。

因此本模块只维护一份**轻量分组索引**（进程内缓存）：分组元数据 + 题目 id 列表，
**不含 passage 原文**。真正的题面只在**被选中的那一组**里按 id 取。

缓存失效有两道保险：
1. **题库条数校验** —— 每次取索引前跑一次 ``count(*)``（索引扫描，亚毫秒级）；
   条数变了立刻重建（导入新题库、测试新增题目都能立刻看到）。
2. **TTL** —— 理论上「换题不换条数」的导入，TTL 到期后自动重建。

题库只由 ``scripts/import_catalog.py`` 写入，应用运行时没有任何写路径
（``app/`` 下无 ``ExamQuestion(...)`` 构造），所以这个缓存不会漏掉运行期变更。
"""

import hashlib
import json
import time
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import BadRequestError, NotFoundError
from app.models.exam_test import ExamAnswer, ExamPaper, ExamQuestion, ExamSession
from app.models.user import User
from app.services import exam_service


@dataclass(frozen=True)
class _GroupIndex:
    """一组「完整可答」的题目的元数据 —— 不含 passage 原文。"""

    paper_id: str
    section: str
    question_type: str
    question_ids: tuple[str, ...]
    level: str


@dataclass(frozen=True)
class _BankIndex:
    """整份题库的分组索引（进程内缓存）。"""

    question_count: int
    groups: tuple[_GroupIndex, ...]
    type_counts: dict[str, dict[str, int]]


# 进程内索引缓存。题库在运行期是静态的（只有导入脚本会写），所以进程内缓存
# 是安全的；多 worker 各自持有一份，互不影响。
_BANK_INDEX: _BankIndex | None = None
_BANK_INDEX_BUILT_AT: float = 0.0
_BANK_INDEX_TTL_SECONDS = 300.0


def invalidate_bank_index() -> None:
    """清掉分组索引缓存（导入题库后调用；测试里新增题目后也可用）。"""
    global _BANK_INDEX, _BANK_INDEX_BUILT_AT
    _BANK_INDEX = None
    _BANK_INDEX_BUILT_AT = 0.0


async def _build_bank_index(db: AsyncSession) -> _BankIndex:
    """整库扫一次，产出不含题面原文的分组索引。"""
    rows = (
        await db.execute(
            select(ExamQuestion, ExamPaper)
            .join(ExamPaper)
            .order_by(ExamPaper.year.desc(), ExamPaper.month.desc(), ExamPaper.id, ExamQuestion.number)
        )
    ).all()
    papers = {p.id: p for _, p in rows}
    groups = complete_question_groups([q for q, _ in rows])
    type_counts: dict[str, dict[str, int]] = {
        kind: {"group_count": 0, "question_count": 0} for kind in ("reading", "matching", "cloze")
    }
    indexed: list[_GroupIndex] = []
    for group in groups:
        first = group[0]
        paper = papers.get(first.paper_id)
        kind = first.question_type
        indexed.append(
            _GroupIndex(
                paper_id=first.paper_id,
                section=first.section,
                question_type=kind,
                question_ids=tuple(q.id for q in group),
                level=paper.level if paper else "",
            )
        )
        if kind in type_counts:
            type_counts[kind]["group_count"] += 1
            type_counts[kind]["question_count"] += len(group)
    return _BankIndex(question_count=len(rows), groups=tuple(indexed), type_counts=type_counts)


async def _get_bank_index(db: AsyncSession) -> _BankIndex:
    """取分组索引：条数没变且 TTL 未到 → 复用；否则重建。"""
    global _BANK_INDEX, _BANK_INDEX_BUILT_AT
    count = (await db.execute(select(func.count()).select_from(ExamQuestion))).scalar() or 0
    cached = _BANK_INDEX
    if cached is not None and cached.question_count == count and cached.question_count:
        if time.monotonic() - _BANK_INDEX_BUILT_AT < _BANK_INDEX_TTL_SECONDS:
            return cached
    index = await _build_bank_index(db)
    _BANK_INDEX = index
    _BANK_INDEX_BUILT_AT = time.monotonic()
    return index


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
    index = await _get_bank_index(db)
    types = {kind: dict(counts) for kind, counts in index.type_counts.items()}
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
    # 分组走缓存索引（不含题面原文）；题面只取被选中的那一组。
    index = await _get_bank_index(db)
    groups = index.groups
    if not groups:
        raise NotFoundError("题库暂时没有可练习的完整题组，请稍后再来")
    target_groups = [g for g in groups if g.level == target]
    preferred = question_type or (wrong_types.most_common(1)[0][0] if wrong_types else None)
    preferred_groups = [g for g in groups if g.question_type == preferred] if preferred else []
    if question_type and not preferred_groups:
        raise NotFoundError("当前题库暂无这类完整题组，可以先选择其他题型")
    # Recent mistakes choose the type first; the target exam breaks ties within it.
    candidates = (
        [g for g in preferred_groups if g.level == target] or preferred_groups
        if preferred_groups
        else target_groups or groups
    )
    chosen = candidates[variant % len(candidates)]
    paper = await db.get(ExamPaper, chosen.paper_id)
    # 只有被选中的这一组才把 passage 原文读进内存（几 KB，而不是整库 16 MB）。
    chosen_questions = list(
        (
            await db.execute(
                select(ExamQuestion).where(ExamQuestion.id.in_(chosen.question_ids)).order_by(ExamQuestion.number)
            )
        )
        .scalars()
        .all()
    )
    labels = {"reading": "仔细阅读", "matching": "长篇匹配", "cloze": "选词填空"}
    reason = (
        f"最近一次练习在{labels.get(preferred, preferred)}的错题较多，推荐练习同类题。"
        if preferred and chosen.question_type == preferred
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
            "question_ids": list(chosen.question_ids),
            "fingerprint": _fingerprint(chosen_questions),
            "exp": now + timedelta(minutes=30),
        },
        get_settings().jwt_secret,
        algorithm="HS256",
    )
    return {
        "token": token,
        "title": paper.title if paper else "真题练习",
        "level": paper.level if paper else chosen.level,
        "reason": reason,
        "question_type": chosen.question_type,
        "question_count": len(chosen_questions),
        "group_count": len(candidates),
        "variant": variant,
        "passage": chosen_questions[0].passage if chosen_questions else None,
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
