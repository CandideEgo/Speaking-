"""PR1: grading and exposure use the question set frozen before answering."""

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.errors import AppError
from app.core.security import create_token
from app.models.exam_test import ExamAnswer, ExamQuestion, ExamSession
from app.models.question_exposure import UserExposureMappingState, UserQuestionExposure
from app.models.user import User
from app.services import account_data, exam_service, question_exposure_service
from tests.test_exams_api import _seed_paper


@pytest_asyncio.fixture
async def exam_context(db_session):
    user = User(phone="13888889991", name="Snapshot")
    db_session.add(user)
    await db_session.flush()
    paper = await _seed_paper(db_session)
    return user, paper


async def _start(db, user, paper, mode):
    if mode == "paper_exam":
        loaded = await exam_service.get_paper_with_questions(db, paper.id)
        session = await exam_service.create_paper_session(db, user.id, loaded)
    elif mode == "daily_check":
        session, _ = await exam_service.create_daily_session(db, user.id, "cet4", 3)
    else:
        loaded = await exam_service.get_paper_with_questions(db, paper.id)
        prior = await exam_service.create_paper_session(db, user.id, loaded)
        await db.commit()
        rows = (await db.execute(select(ExamAnswer).where(ExamAnswer.session_id == prior.id))).scalars().all()
        await exam_service.submit_answers(
            db, prior, user.id, [{"question_id": row.question["id"], "answer": "Z"} for row in rows]
        )
        session, _ = await exam_service.create_wrong_redo_session(db, user.id)
    await db.commit()
    return session


@pytest.mark.parametrize("mode", ["paper_exam", "daily_check", "wrong_redo"])
async def test_all_modes_freeze_before_bank_changes_and_deleted_question(db_session, exam_context, client, mode):
    user, paper = exam_context
    session = await _start(db_session, user, paper, mode)
    sid, uid = session.id, user.id
    rows = (await db_session.execute(select(ExamAnswer).where(ExamAnswer.session_id == sid))).scalars().all()
    assert len(rows) == session.question_count == 3
    assert session.snapshot_schema_version == 1 and session.snapshot_completed_at is not None
    original = {row.question["id"]: dict(row.question) for row in rows}
    for snap in original.values():
        assert snap["question_key"] == f"exam:cet4:2023:3:1:{snap['number']}"
        assert snap["paper"]["id"] == paper.id
    questions = (await db_session.execute(select(ExamQuestion))).scalars().all()
    for question in questions:
        question.answer = "Z"
        question.question = "Bank changed."
        question.explanation = "Different explanation."
        question.options = {"Z": "Changed choice"}
    # SQLite tests do not enforce FK SET NULL; emulate the database effect,
    # while the dedicated PostgreSQL test checks the real referential action.
    deleted_id = questions[0].id
    await db_session.delete(questions[0])
    next(row for row in rows if row.question["id"] == deleted_id).question_id = None
    await db_session.commit()
    submitted = [{"question_id": qid, "answer": snap["answer"].lower()} for qid, snap in original.items()]
    result = await exam_service.submit_answers(db_session, session, uid, submitted)
    assert result["score"] == 1.0 and result["total"] == 3
    assert all(row["question"] != "Bank changed." for row in result["results"])
    assert {row["question_id"] for row in result["results"]} == set(original)
    replay = await exam_service.submit_answers(db_session, session, uid, [])
    assert replay == result
    response = await client.get(
        f"/api/v1/exams/attempts/{sid}", headers={"Authorization": f"Bearer {create_token(uid)}"}
    )
    assert response.status_code == 200, response.text
    assert {row["question_id"] for row in response.json()["results"]} == set(original)
    exposures = (
        await db_session.execute(select(UserQuestionExposure).where(UserQuestionExposure.user_id == uid))
    ).scalars()
    assert {row.question_key for row in exposures} == {snap["question_key"] for snap in original.values()}


@pytest.mark.parametrize("mode", ["paper_exam", "daily_check", "wrong_redo"])
async def test_all_modes_reject_duplicate_or_foreign_ids_and_count_omissions(db_session, exam_context, mode):
    user, paper = exam_context
    session = await _start(db_session, user, paper, mode)
    sid, uid = session.id, user.id
    rows = (await db_session.execute(select(ExamAnswer).where(ExamAnswer.session_id == sid))).scalars().all()
    answer = {"question_id": rows[0].question["id"], "answer": rows[0].question["answer"]}
    for invalid in [[answer, answer], [{"question_id": "not-in-this-attempt", "answer": "A"}]]:
        loaded = await exam_service.get_attempt_detail(db_session, sid, uid)
        with pytest.raises(AppError) as caught:
            await exam_service.submit_answers(db_session, loaded, uid, invalid)
        assert caught.value.status_code == 409
    loaded = await exam_service.get_attempt_detail(db_session, sid, uid)
    result = await exam_service.submit_answers(db_session, loaded, uid, [answer])
    assert result["total"] == 3 and result["correct_count"] == 1
    assert sum(row["user_answer"] is None for row in result["results"]) == 2


async def test_missing_or_incomplete_legacy_snapshot_rejects_without_claiming(db_session, exam_context):
    user, paper = exam_context
    uid = user.id
    legacy = ExamSession(
        user_id=uid, paper_id=paper.id, mode="paper_exam", question_count=3, started_at=datetime.now(UTC)
    )
    db_session.add(legacy)
    await db_session.commit()
    sid = legacy.id
    with pytest.raises(AppError) as caught:
        await exam_service.submit_answers(db_session, legacy, uid, [])
    assert caught.value.code == "EXAM_SNAPSHOT_UNAVAILABLE"
    restored = await exam_service.get_attempt_detail(db_session, sid, uid)
    assert restored.submitted_at is None and restored.score is None
    report = await question_exposure_service.backfill_user_exposures(db_session, uid)
    assert report["status"] == "unknown" and report["unmapped"] == 3


async def test_complete_legacy_daily_placeholder_is_graded_without_inventing_provenance(db_session, exam_context):
    user, paper = exam_context
    session = await _start(db_session, user, paper, "daily_check")
    uid, sid = user.id, session.id
    session.snapshot_schema_version = None
    session.snapshot_completed_at = None
    rows = (await db_session.execute(select(ExamAnswer).where(ExamAnswer.session_id == sid))).scalars().all()
    for row in rows:
        row.question = {k: v for k, v in row.question.items() if k not in {"question_key", "paper"}}
    await db_session.commit()
    result = await exam_service.submit_answers(db_session, session, uid, [])
    assert result["total"] == 3 and result["correct_count"] == 0
    report = await question_exposure_service.backfill_user_exposures(db_session, uid)
    assert report == {"mapped": 0, "unmapped": 3, "status": "unknown"}


async def test_exposure_failure_rolls_back_grade_and_submit_claim(db_session, exam_context, monkeypatch):
    user, paper = exam_context
    session = await _start(db_session, user, paper, "paper_exam")
    uid, sid = user.id, session.id

    async def fail(*args, **kwargs):
        raise RuntimeError("exposure unavailable")

    monkeypatch.setattr(question_exposure_service, "record_answer_available", fail)
    with pytest.raises(RuntimeError, match="exposure unavailable"):
        await exam_service.submit_answers(db_session, session, uid, [])
    restored = await exam_service.get_attempt_detail(db_session, sid, uid)
    assert restored.submitted_at is None and restored.score is None
    assert all(row.answered_at is None and row.correct is None for row in restored.answers)


async def test_unsubmitted_export_hides_answers_then_submitted_export_preserves_them(db_session, exam_context):
    user, paper = exam_context
    session = await _start(db_session, user, paper, "paper_exam")
    data = await account_data.gather_user_data(db_session, user)
    assert len(data["exam_sessions"][0]["answers"]) == 3
    assert all("answer" not in row["question"] for row in data["exam_sessions"][0]["answers"])
    assert all("explanation" not in row["question"] for row in data["exam_sessions"][0]["answers"])
    await exam_service.submit_answers(db_session, session, user.id, [])
    data = await account_data.gather_user_data(db_session, user)
    assert all("answer" in row["question"] for row in data["exam_sessions"][0]["answers"])
    assert len(data["question_exposures"]) == 3


async def test_backfill_is_idempotent_preserves_scores_and_tracks_complete_mapping(db_session, exam_context):
    user, paper = exam_context
    session = await _start(db_session, user, paper, "paper_exam")
    await exam_service.submit_answers(db_session, session, user.id, [])
    before = await question_exposure_service.backfill_user_exposures(db_session, user.id)
    after = await question_exposure_service.backfill_user_exposures(db_session, user.id)
    assert before == after == {"mapped": 3, "unmapped": 0, "status": "complete"}
    assert session.score == 0.0
    state = await db_session.get(UserExposureMappingState, user.id)
    assert state.checked_at is not None
