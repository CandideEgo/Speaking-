#!/usr/bin/env python
"""清空指定科目的试卷（含题目），删前先导出一份可直接再导入的 JSON。

用于「换源重灌」：站内 CET 试卷来自两个渠道（HelloCET / xdf），槽位口径与真题原文
对不上（实测存在同一套内容被 10 个不同 (year, month, set_no) 键重复收录、以及
「站内 2017-06 第1套」= 「真题原文 2017-06 第2套」这类错位）。重灌时先把整科删干净，
再让 ``import_exam_papers.py`` 从单一来源导入。

**删试卷不会毁掉历史作答。** ``ExamSession.paper_id`` 与 ``ExamAnswer.question_id``
都是 ``ondelete="SET NULL"``（``app/models/exam_test.py``），而 ``ExamAnswer.question``
是冻结快照；成绩页与错题本对 null 都有保护（``exam_service.py`` 里 ``paper.questions
if paper else []`` 那几处）。题目行是真的删了（``exam_questions.paper_id`` 是 CASCADE）。

**不动 ``exam_sentences``。** 真题语料是按 ``(level, sentence_en)`` 去重的一大池句子，
喂给词卡「例句」与高频徽章用；删掉旧卷子留下的句子仍是真的真题句子，留着只有好处。
代价：站内独有、真题原文没有的那几套卷子被删后，它们的例句仍留在语料里 —— 想连语料
一起收干净得另外写，本轮不做（``--backup`` 里留着卷子本体，必要时可再灌回）。

用法：

    cd backend
    python scripts/purge_exam_papers.py --level cet4 --level cet6 \\
        --backup C:/Users/Administrator/guojiya/backup_exam_papers.json --dry-run
    python scripts/purge_exam_papers.py --level cet4 --level cet6 --backup <同上>
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import delete, func, select

from app.core.database import async_session
from app.models.exam_test import ExamPaper, ExamQuestion

# 与 import_exam_papers.py 的 _Q_FIELDS 对齐，导出即可直接再导入。
_Q_FIELDS = ("section", "number", "passage", "question", "options", "answer", "explanation", "question_type")


def dump(records: list[dict]) -> bytes:
    return json.dumps(records, ensure_ascii=False, indent=1).replace("\n", "\r\n").encode("utf-8")


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--level", action="append", required=True, help="要清空的科目 key，可重复")
    ap.add_argument("--backup", type=Path, help="把被删的试卷按导入格式导出到这里（强烈建议给）")
    ap.add_argument("--dry-run", action="store_true", help="只统计与备份，不删")
    args = ap.parse_args()

    levels = sorted(set(args.level))
    async with async_session() as db:
        papers = (
            (
                await db.execute(
                    select(ExamPaper)
                    .where(ExamPaper.level.in_(levels))
                    .order_by(ExamPaper.level, ExamPaper.year, ExamPaper.month, ExamPaper.set_no)
                )
            )
            .scalars()
            .all()
        )
        if not papers:
            print(f"[skip] {levels} 下没有试卷")
            return 0

        ids = [p.id for p in papers]
        n_q = (
            await db.execute(select(func.count()).select_from(ExamQuestion).where(ExamQuestion.paper_id.in_(ids)))
        ).scalar_one()

        per_level: dict[str, int] = {}
        for p in papers:
            per_level[p.level] = per_level.get(p.level, 0) + 1
        print(f"[plan] 删除 {len(papers)} 套 / {n_q} 题  分科：{per_level}")

        if args.backup:
            records = []
            for p in papers:
                qs = (
                    (
                        await db.execute(
                            select(ExamQuestion).where(ExamQuestion.paper_id == p.id).order_by(ExamQuestion.number)
                        )
                    )
                    .scalars()
                    .all()
                )
                records.append(
                    {
                        "level": p.level,
                        "year": p.year,
                        "month": p.month,
                        "set_no": p.set_no,
                        "title": p.title,
                        "source": p.source,
                        "questions": [{f: getattr(q, f) for f in _Q_FIELDS} for q in qs],
                    }
                )
            args.backup.parent.mkdir(parents=True, exist_ok=True)
            args.backup.write_bytes(dump(records))
            print(f"[backup] {len(records)} 套 → {args.backup}")

        if args.dry_run:
            print("[dry-run] 未删除任何行")
            return 0

        await db.execute(delete(ExamQuestion).where(ExamQuestion.paper_id.in_(ids)))
        await db.execute(delete(ExamPaper).where(ExamPaper.id.in_(ids)))
        await db.commit()
        print(f"[done] 已删除 {len(papers)} 套试卷与 {n_q} 道题（历史作答保留，paper_id 置空）")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
