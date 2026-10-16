"""试卷库的「科目」表：把 ``exam_papers.level`` 上的裸字符串收成一张有次序、有中文名的表。

**这是一套独立于词汇等级（``app/core/exam_levels.py``）的东西。** 两边今天只是
碰巧共用 ``cet4`` / ``cet6`` 两个字符串：本表管的是「试卷属于哪门考试」，等级表管的是
「一个词属于哪个考试的大纲词表」。专四专八只有原卷 PDF、没有题库数据，所以它们在这里
有科目名却不会有 ``ExamPaper`` 行；反过来 ``kaoyan`` 只服务 PDF —— 考研题库按英语一 /
英语二拆成 ``ky1`` / ``ky2``，而原卷 PDF 只有「考研英语」这一个来源分类。

``ExamPaper.level`` 上**没有任何白名单校验**（导入脚本、schema、API 全是裸 str），
所以这张表是**展示用**的：它决定前端按什么顺序、用什么名字列科目；联邦新科目只需要在
这里加一行、在 ``frontend/src/lib/examSubjects.ts`` 同步一行，不动数据库。
"""

from __future__ import annotations

# 科目 key -> 展示名与排序（order 越小越靠前）。
EXAM_SUBJECTS: dict[str, dict[str, object]] = {
    "cet4": {"label": "四级", "order": 1},
    "cet6": {"label": "六级", "order": 2},
    "ky1": {"label": "考研英语一", "order": 3},
    "ky2": {"label": "考研英语二", "order": 4},
    "kaoyan": {"label": "考研英语", "order": 5},
    "tem4": {"label": "专四", "order": 6},
    "tem8": {"label": "专八", "order": 7},
}

EXAM_SUBJECT_KEYS: list[str] = [k for k, _ in sorted(EXAM_SUBJECTS.items(), key=lambda kv: kv[1]["order"])]


def subject_label(key: str) -> str:
    """中文名；表里没有的原样返回，免得新科目在界面上变成空白。"""
    return str(EXAM_SUBJECTS.get(key, {}).get("label") or key)
