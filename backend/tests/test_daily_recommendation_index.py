"""每日推荐（G9）：分组索引缓存回归 —— 不再整库搬题面 + 题库变更即重建。

背景：修复前 ``/api/v1/discovery/daily`` 每次请求都全表读 ``exam_questions``
（生产 5235 行，passage 原文合计 16.4 MB）再在内存里分组，等于每个请求把
整个题库题面搬一遍。修复后只有一份轻量分组索引（分组元数据 + 题目 id，
不含原文），题面只按被选中组的 id 取。

本测试钉两件事：

- **第二次请求命中缓存**：不重跑整库扫描（``_build_bank_index`` 在整个测试里
  只应执行一次），且第二次请求的 SQL 里没有未筛筛选的全表读。
- **题库条数变化即重建**：新增题目后（``count(*)`` 变化）下一次请求自动重建
  索引，新题立即可见。

实现上用 spy 包装 ``daily_recommendation_service._build_bank_index`` 计数，
直接断言“整库扫描发生了多少次”这一行为；SQL 层再用 event listener 佐证。
"""

from __future__ import annotations

import pytest
from sqlalchemy import event, func, select

from app.models.exam_test import ExamPaper, ExamQuestion
from app.services import daily_recommendation_service
from tests.conftest import test_engine

DAILY_URL = "/api/v1/discovery/daily"


def _is_full_bank_scan(statement: str) -> bool:
    """True 当语句是不带过滤的 exam_questions 全表读（含 join 整行投影）。

    计数检查（``SELECT count(*) FROM exam_questions``）与按 id 取选中组
    （带 WHERE）都不算——它们正是修复后允许留下的两类查询。
    """
    low = statement.lower()
    return "from exam_questions" in low and "where" not in low and "count" not in low


@pytest.fixture
def captured_sql():
    """收集测试期间在 test_engine 上执行的 SQL 语句。"""
    captured: list[str] = []

    def listener(_conn, _cursor, statement, _params, _context, _executemany):
        captured.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", listener)
    yield captured
    event.remove(test_engine.sync_engine, "before_cursor_execute", listener)


async def _seed_reading_bank(db, passages=2, per_passage=2):
    """一个 4 级卷 + 两道完整阅读题组（每组 per_passage 道，均带 options）。

    与 test_discovery_api.py::test_daily_preview_... 相同的种子形状：
    每组题目都 ``is_answerable``（有 options），因此会进索引。
    """
    paper = ExamPaper(title="Test CET4", level="cet4", year=2025, month=6, set_no=1)
    db.add(paper)
    await db.flush()
    for p in range(passages):
        for i in range(per_passage):
            db.add(
                ExamQuestion(
                    paper_id=paper.id,
                    number=p * per_passage + i + 1,
                    section="reading_C",
                    passage=f"Passage {'ABC'[p]}",
                    question=f"Q{p * per_passage + i + 1}",
                    options={"A": "yes", "B": "no"},
                    answer="A",
                    question_type="reading",
                )
            )
    await db.commit()
    return paper


def _spy_build_bank_index(monkeypatch):
    """把 ``_build_bank_index`` 包一层 spy，返回 ``{"n": 调用次数}``。"""
    calls = {"n": 0}
    original = daily_recommendation_service._build_bank_index

    async def spy(db):
        calls["n"] += 1
        return await original(db)

    monkeypatch.setattr(daily_recommendation_service, "_build_bank_index", spy)
    return calls


@pytest.mark.asyncio
async def test_second_preview_hits_cache_without_rescan(client, auth_headers, db_session, monkeypatch, captured_sql):
    daily_recommendation_service.invalidate_bank_index()
    calls = _spy_build_bank_index(monkeypatch)

    await _seed_reading_bank(db_session)

    r1 = await client.get(f"{DAILY_URL}?variant=0", headers=auth_headers)
    assert r1.status_code == 200
    body1 = r1.json()
    assert body1["question_count"] == 2
    assert calls["n"] == 1  # 冷启动：第一次请求建索引

    captured_sql.clear()
    r2 = await client.get(f"{DAILY_URL}?variant=1", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["passage"] != body1["passage"]
    assert calls["n"] == 1  # 命中缓存：不重扫整库

    scans = [s for s in captured_sql if _is_full_bank_scan(s)]
    assert scans == [], f"第二次请求不应出现整库扫描，实际捕获到: {scans}"


@pytest.mark.asyncio
async def test_bank_row_count_change_invalidates_index(client, auth_headers, db_session, monkeypatch):
    daily_recommendation_service.invalidate_bank_index()
    calls = _spy_build_bank_index(monkeypatch)

    paper = await _seed_reading_bank(db_session)

    r1 = await client.get(f"{DAILY_URL}?variant=0", headers=auth_headers)
    assert r1.status_code == 200
    assert calls["n"] == 1

    count_before = await db_session.scalar(select(func.count()).select_from(ExamQuestion))
    # 新增一组完整题（同卷新段落）→ 条数变化
    for i in range(2):
        db_session.add(
            ExamQuestion(
                paper_id=paper.id,
                number=6 + i,
                section="reading_C",
                passage="Passage C",
                question=f"Q{6 + i}",
                options={"A": "yes", "B": "no"},
                answer="A",
                question_type="reading",
            )
        )
    await db_session.commit()
    count_after = await db_session.scalar(select(func.count()).select_from(ExamQuestion))
    assert count_after == count_before + 2

    r2 = await client.get(f"{DAILY_URL}?variant=2", headers=auth_headers)
    assert r2.status_code == 200
    assert calls["n"] == 2  # count 变化 → 索引重建
    assert r2.json()["passage"] == "Passage C"  # 新题组立即可见
