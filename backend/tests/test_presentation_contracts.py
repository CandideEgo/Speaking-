"""Presentation contracts: read-only vocabulary previews and complete exam catalogs."""

from datetime import UTC, datetime, timedelta

from app.models.exam_test import ExamAnswer, ExamPaper, ExamSession
from app.models.learning import Vocabulary
from tests.conftest import TestSessionLocal
from tests.test_exams_api import _seed_paper
from tests.test_study_sessions import _get_user_id, _seed_new_words, _start


async def test_training_preview_matches_rounds_without_creating_them(client, auth_headers):
    user_id = await _get_user_id(client, auth_headers)
    await _seed_new_words(user_id, 15)
    preview = (await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)).json()
    ids = [w["id"] for w in preview["training_preview"]["new_words"]]
    assert len(ids) == 10
    assert preview["training_preview"]["active_session_id"] is None
    current = (await client.get("/api/v1/vocabulary/sessions/current", headers=auth_headers)).json()
    assert current["session"] is None
    assert current["today"]["rounds"] == 0

    started = (await _start(client, auth_headers))["session"]
    assert [item["vocabulary_id"] for item in started["items"]] == ids
    await client.put("/api/v1/vocabulary/preferences", json={"daily_new_target": 30}, headers=auth_headers)
    for _ in range(2):
        response = await client.post(
            f"/api/v1/vocabulary/sessions/{started['id']}/answer",
            json={"vocabulary_id": ids[0], "correct": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
    preview = (await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)).json()["training_preview"]
    assert preview["active_session_id"] == started["id"]
    assert [w["id"] for w in preview["new_words"]] == ids[1:]

    await client.post(f"/api/v1/vocabulary/sessions/{started['id']}/finish", headers=auth_headers)
    preview = (await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)).json()["training_preview"]
    next_ids = [w["id"] for w in preview["new_words"]]
    assert len(next_ids) == 5
    assert not set(ids).intersection(next_ids)
    second = (await _start(client, auth_headers))["session"]
    assert [item["vocabulary_id"] for item in second["items"]] == next_ids


async def test_training_preview_excludes_active_words_from_review(client, auth_headers):
    user_id = await _get_user_id(client, auth_headers)
    await _seed_new_words(user_id, 5)
    started = (await _start(client, auth_headers))["session"]
    word_id = started["items"][0]["vocabulary_id"]
    async with TestSessionLocal() as db:
        word = await db.get(Vocabulary, word_id)
        word.mastery_level = "learning"
        word.next_review_at = datetime.now(UTC) - timedelta(days=2)
        await db.commit()
    data = (await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)).json()
    assert data["totals"]["due_total"] == 1
    assert word_id in [w["id"] for w in data["training_preview"]["new_words"]]
    assert word_id not in [w["id"] for w in data["training_preview"]["review_words"]]


async def test_catalog_filters_full_dataset_and_year_facets(client, auth_headers, db_session):
    for i in range(55):
        db_session.add(
            ExamPaper(level="cet4", year=2020 + i // 30, month=6, set_no=i + 1, title=f"paper {i}", total_questions=3)
        )
    db_session.add(ExamPaper(level="cet6", year=2010, month=6, set_no=1, title="other level", total_questions=3))
    await db_session.commit()
    response = await client.get("/api/v1/exams?level=cet4&page=5&page_size=12", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 55
    assert len(data["items"]) == 7
    assert data["available_years"] == [2021, 2020]
    filtered = (await client.get("/api/v1/exams?level=cet4&year=2020&status=submitted", headers=auth_headers)).json()
    assert filtered["total"] == 0
    assert filtered["available_years"] == [2021, 2020]
    unsubmitted = (
        await client.get("/api/v1/exams?level=cet4&year=2020&status=unsubmitted", headers=auth_headers)
    ).json()
    assert unsubmitted["total"] == 30
    assert (await client.get("/api/v1/exams?status=unknown", headers=auth_headers)).status_code == 422


async def test_catalog_uses_latest_submission_and_frozen_counts(client, auth_headers, db_session):
    paper = await _seed_paper(db_session)
    user_id = await _get_user_id(client, auth_headers)
    now = datetime.now(UTC)
    for session_id, start, submitted, correct in [
        ("latest", now - timedelta(days=3), now, True),
        ("earlier", now - timedelta(days=1), now - timedelta(hours=1), False),
    ]:
        db_session.add(
            ExamSession(
                id=session_id,
                user_id=user_id,
                paper_id=paper.id,
                mode="paper_exam",
                started_at=start,
                submitted_at=submitted,
                score=0.5 if correct else 0,
                question_count=2,
            )
        )
        await db_session.flush()
        db_session.add(ExamAnswer(session_id=session_id, question={}, correct=correct))
    await db_session.commit()
    data = (await client.get("/api/v1/exams?status=submitted", headers=auth_headers)).json()
    assert data["total"] == 1
    item = data["items"][0]
    assert item["last_session_id"] == "latest"
    assert item["last_question_count"] == 2
    assert item["total_questions"] == 3
    assert item["last_correct_count"] == 1
    assert (await client.get("/api/v1/exams?status=unsubmitted", headers=auth_headers)).json()["total"] == 0


async def test_catalog_status_and_latest_result_are_scoped_to_owner(client, auth_headers, db_session):
    from app.models.user import User

    paper = await _seed_paper(db_session)
    other = User(phone="13900000009", hashed_password="x", name="Other")
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        ExamSession(
            user_id=other.id,
            paper_id=paper.id,
            mode="paper_exam",
            question_count=3,
            started_at=datetime.now(UTC),
            submitted_at=datetime.now(UTC),
        )
    )
    await db_session.commit()
    assert (await client.get("/api/v1/exams?status=submitted", headers=auth_headers)).json()["total"] == 0
    data = (await client.get("/api/v1/exams?status=unsubmitted", headers=auth_headers)).json()
    assert data["total"] == 1
    assert data["items"][0]["last_session_id"] is None
