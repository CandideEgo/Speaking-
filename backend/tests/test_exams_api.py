"""Tests for the 真题测试 (past-paper exam) API."""

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.exam_test import ExamPaper, ExamQuestion, ExamSession
from app.models.user import User


async def _seed_paper(db, level: str = "cet4", year: int = 2023, month: int = 3, set_no: int = 1) -> ExamPaper:
    """Create a paper with 3 questions (one per reading section)."""
    paper = ExamPaper(
        level=level,
        year=year,
        month=month,
        set_no=set_no,
        title=f"{year}年{month}月真题（第{set_no}套）",
        source="test",
        total_questions=3,
    )
    db.add(paper)
    await db.flush()
    specs = [
        (26, "reading_A", "cloze", "Passage A.", None, {"A": "alpha", "B": "beta"}, "B"),
        (36, "reading_B", "matching", "Paragraph B.", "Statement 36.", None, "A"),
        (
            46,
            "reading_C",
            "reading",
            "Passage C.",
            "What is the answer?",
            {"A": "x", "B": "y", "C": "z", "D": "w"},
            "C",
        ),
    ]
    for number, section, qtype, passage, question, options, answer in specs:
        db.add(
            ExamQuestion(
                paper_id=paper.id,
                section=section,
                number=number,
                question_type=qtype,
                passage=passage,
                question=question,
                options=options,
                answer=answer,
            )
        )
    await db.commit()
    return paper


@pytest_asyncio.fixture
async def seeded_paper(db_session):
    return await _seed_paper(db_session)


async def test_list_exams_shows_attempt_stats(client, auth_headers, seeded_paper, db_session):
    resp = await client.get("/api/v1/exams?level=cet4", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    item = data["items"][0]
    assert item["title"] == seeded_paper.title
    assert item["total_questions"] == 3
    # no attempts yet
    assert item["attempt_count"] == 0
    assert item["last_score"] is None


async def test_paper_detail_does_not_leak_answers(client, auth_headers, seeded_paper):
    resp = await client.get(f"/api/v1/exams/{seeded_paper.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["questions"]) == 3
    q = data["questions"][0]
    assert "answer" not in q
    assert "explanation" not in q
    assert q["number"] == 26


async def test_create_and_submit_attempt_full_flow(client, auth_headers, seeded_paper, db_session):
    # create attempt
    resp = await client.post(f"/api/v1/exams/{seeded_paper.id}/attempts", headers=auth_headers)
    assert resp.status_code == 200
    payload = resp.json()
    sid = payload["session_id"]
    assert payload["mode"] == "paper_exam"
    assert payload["question_count"] == 3
    qs = {q["number"]: q for q in payload["questions"]}
    assert set(qs) == {26, 36, 46}

    # fetch real answers from DB and submit: 2 correct + 1 wrong
    rows = (
        (await db_session.execute(select(ExamQuestion).where(ExamQuestion.paper_id == seeded_paper.id))).scalars().all()
    )
    answers = []
    for i, q in enumerate(rows):
        if i < 2:
            answers.append({"question_id": q.id, "answer": q.answer})
        else:
            answers.append({"question_id": q.id, "answer": "A" if q.answer != "A" else "B"})

    resp = await client.post(f"/api/v1/exams/attempts/{sid}/submit", json={"answers": answers}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct_count"] == 2
    assert data["total"] == 3
    assert data["score"] == round(2 / 3, 4)
    assert "reading_A" in data["part_scores"]
    # results carry correct answers after submit
    results = {r["number"]: r for r in data["results"]}
    assert results[46]["correct_answer"] == "C"
    assert results[46]["correct"] is False

    # double submit is rejected
    resp = await client.post(f"/api/v1/exams/attempts/{sid}/submit", json={"answers": []}, headers=auth_headers)
    assert resp.status_code == 409


async def test_submit_foreign_session_forbidden(client, auth_headers, seeded_paper, db_session):
    # another user's attempt
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        other = User(phone="13900000001", hashed_password="x", name="Other")
        db.add(other)
        await db.flush()
        sess = ExamSession(
            user_id=other.id,
            mode="paper_exam",
            paper_id=seeded_paper.id,
            question_count=3,
            started_at=datetime.now(UTC),
        )
        db.add(sess)
        await db.commit()
        other_sid = sess.id

    resp = await client.post(f"/api/v1/exams/attempts/{other_sid}/submit", json={"answers": []}, headers=auth_headers)
    # foreign sessions are invisible (404, no existence leak)
    assert resp.status_code == 404
    resp = await client.get(f"/api/v1/exams/attempts/{other_sid}", headers=auth_headers)
    assert resp.status_code == 404


async def test_attempt_history_and_detail(client, auth_headers, seeded_paper, db_session):
    resp = await client.post(f"/api/v1/exams/{seeded_paper.id}/attempts", headers=auth_headers)
    sid = resp.json()["session_id"]
    await client.post(f"/api/v1/exams/attempts/{sid}/submit", json={"answers": []}, headers=auth_headers)

    resp = await client.get("/api/v1/exams/attempts", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["paper_title"] == seeded_paper.title
    assert items[0]["score"] == 0.0

    resp = await client.get(f"/api/v1/exams/attempts/{sid}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["submitted"] is True
    assert len(data["results"]) == 3
    assert data["results"][0]["correct_answer"] is not None


async def test_daily_check_start(client, auth_headers, seeded_paper):
    resp = await client.get("/api/v1/exams/daily/start?count=3", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "daily_check"
    assert data["question_count"] == 3
    assert all("answer" not in q for q in data["questions"])

    # daily with an empty level falls back to the whole bank (still 200)
    resp = await client.get("/api/v1/exams/daily/start?count=3&level=gre", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["question_count"] == 3


async def test_paper_list_level_filter(client, auth_headers, seeded_paper, db_session):
    await _seed_paper(db_session, level="cet6", year=2022, month=12, set_no=2)
    resp = await client.get("/api/v1/exams?level=cet4", headers=auth_headers)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/v1/exams?level=cet6", headers=auth_headers)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/v1/exams", headers=auth_headers)
    assert resp.json()["total"] == 2


async def _start_daily(client, auth_headers, count: int = 3) -> dict:
    resp = await client.get(f"/api/v1/exams/daily/start?count={count}", headers=auth_headers)
    assert resp.status_code == 200
    return resp.json()


async def test_daily_submit_full_flow(client, auth_headers, seeded_paper, db_session):
    """Daily submit with exactly the drawn question set grades normally."""
    payload = await _start_daily(client, auth_headers)
    sid = payload["session_id"]
    qs = payload["questions"]
    assert len(qs) == 3

    rows = (
        (await db_session.execute(select(ExamQuestion).where(ExamQuestion.paper_id == seeded_paper.id))).scalars().all()
    )
    by_id = {q.id: q for q in rows}
    answers = [{"question_id": q["id"], "answer": by_id[q["id"]].answer} for q in qs]

    resp = await client.post(f"/api/v1/exams/attempts/{sid}/submit", json={"answers": answers}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct_count"] == 3
    assert data["total"] == 3

    # attempt detail must show the placeholder rows filled — not duplicated
    resp = await client.get(f"/api/v1/exams/attempts/{sid}", headers=auth_headers)
    detail = resp.json()
    assert len(detail["results"]) == 3
    assert all(r["correct_answer"] is not None for r in detail["results"])


async def test_daily_submit_foreign_question_rejected(client, auth_headers, db_session):
    """Submitting a question that was NOT drawn into the session is rejected
    (prevents answer extraction via the grading response)."""
    await _seed_paper(db_session)
    await _seed_paper(db_session, level="cet6", year=2022, month=12, set_no=2)

    payload = await _start_daily(client, auth_headers)  # draws 3 of 6
    sid = payload["session_id"]
    own_ids = {q["id"] for q in payload["questions"]}
    assert len(own_ids) == 3

    rows = (await db_session.execute(select(ExamQuestion))).scalars().all()
    foreign = [q for q in rows if q.id not in own_ids]
    assert foreign

    resp = await client.post(
        f"/api/v1/exams/attempts/{sid}/submit",
        json={"answers": [{"question_id": foreign[0].id, "answer": "A"}]},
        headers=auth_headers,
    )
    assert resp.status_code == 409
    assert "抽题" in resp.json()["detail"]


async def test_daily_submit_partial_rejected(client, auth_headers, db_session):
    """Submitting only part of the drawn set is rejected (exact set required)."""
    await _seed_paper(db_session)
    payload = await _start_daily(client, auth_headers)
    sid = payload["session_id"]
    qs = payload["questions"]

    answers = [{"question_id": q["id"], "answer": "A"} for q in qs[:1]]
    resp = await client.post(f"/api/v1/exams/attempts/{sid}/submit", json={"answers": answers}, headers=auth_headers)
    assert resp.status_code == 409


async def test_daily_submit_mixed_set_rejected(client, auth_headers, db_session):
    """Drawn set + one extra foreign question is rejected too."""
    await _seed_paper(db_session)
    await _seed_paper(db_session, level="cet6", year=2022, month=12, set_no=2)

    payload = await _start_daily(client, auth_headers)
    sid = payload["session_id"]
    own = payload["questions"]
    own_ids = {q["id"] for q in own}

    rows = (await db_session.execute(select(ExamQuestion))).scalars().all()
    foreign = next(q for q in rows if q.id not in own_ids)
    answers = [{"question_id": q["id"], "answer": "A"} for q in own] + [{"question_id": foreign.id, "answer": "A"}]
    resp = await client.post(f"/api/v1/exams/attempts/{sid}/submit", json={"answers": answers}, headers=auth_headers)
    assert resp.status_code == 409
