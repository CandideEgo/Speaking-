"""Assessment grades, learning facts and disclosure commit as a single result."""

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session_maker
from app.core.errors import UnprocessableEntityError
from app.models.exam_test import ExamAnswer, ExamSession
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.listening import ListeningSession
from app.models.question_exposure import UserQuestionExposure
from app.models.user import User
from app.services import exam_service, listening_service, milestone_service
from tests.test_exam_snapshots import _start
from tests.test_exams_api import _seed_paper
from tests.test_listening_api import seed as seed_video


@pytest_asyncio.fixture(params=["exam", "listening"])
async def assessment(request, client, auth_headers, db_session):
    uid = (await client.get("/api/v1/users/me", headers=auth_headers)).json()["id"]
    user = await db_session.get(User, uid)
    if request.param == "exam":
        paper = await _seed_paper(db_session)
        session = await _start(db_session, user, paper, "paper_exam")
        rows = list((await db_session.scalars(select(ExamAnswer).where(ExamAnswer.session_id == session.id))).all())
        body = {"answers": [{"question_id": row.question["id"], "answer": row.question["answer"]} for row in rows]}
        url = f"/api/v1/exams/attempts/{session.id}/submit"
        total = len(rows)
    else:
        video = await seed_video(db_session)
        session = await listening_service.start(db_session, user, video.id, 5, False)
        await db_session.commit()
        await listening_service.save(db_session, session.id, uid, {q["id"]: q["text_en"] for q in session.questions}, 0)
        await db_session.commit()
        body = None
        url = f"/api/v1/listening/sessions/{session.id}/submit"
        total = len(session.questions)
    return {"kind": request.param, "uid": uid, "sid": session.id, "url": url, "body": body, "total": total}


async def post_submission(client, auth_headers, assessment):
    kwargs = {"json": assessment["body"]} if assessment["body"] is not None else {}
    return await client.post(assessment["url"], headers=auth_headers, **kwargs)


async def assert_unsubmitted(assessment):
    async with get_async_session_maker()() as db:
        model = ExamSession if assessment["kind"] == "exam" else ListeningSession
        row = await db.get(model, assessment["sid"])
        assert row.submitted_at is None
        if assessment["kind"] == "exam":
            assert row.score is None
            answers = list((await db.scalars(select(ExamAnswer).where(ExamAnswer.session_id == row.id))).all())
            assert all(answer.answered_at is None and answer.correct is None for answer in answers)
            assert await db.scalar(select(func.count(UserQuestionExposure.user_id))) == 0
        else:
            assert row.results is None and row.correct_count is None
            assert len(row.answers) == assessment["total"]  # The saved draft survives.
        assert await db.scalar(select(func.count(LearningEvent.id))) == 0
        assert await db.scalar(select(func.count(UserLearningProfile.id))) == 0


async def assert_one_fact(assessment):
    async with get_async_session_maker()() as db:
        events = list((await db.scalars(select(LearningEvent))).all())
        assert len(events) == 1
        event = events[0]
        assert (event.event_type, event.event_value, event.flow_id, event.source) == (
            "practiced_items",
            assessment["total"],
            assessment["sid"],
            assessment["kind"],
        )
        profile = await db.scalar(select(UserLearningProfile).where(UserLearningProfile.user_id == assessment["uid"]))
        assert profile.current_streak == 1


async def test_projection_failure_rolls_back_grading_then_retry_succeeds(client, auth_headers, assessment, monkeypatch):
    async def fail(*args, **kwargs):
        raise RuntimeError("required projection failed")

    with monkeypatch.context() as patch:
        patch.setattr(milestone_service, "ensure_today_snapshot", fail)
        with pytest.raises(RuntimeError, match="required projection failed"):
            await post_submission(client, auth_headers, assessment)
    await assert_unsubmitted(assessment)
    response = await post_submission(client, auth_headers, assessment)
    assert response.status_code == 200, response.text
    assert response.json()["correct_count"] == assessment["total"]
    await assert_one_fact(assessment)


@pytest.mark.parametrize("committed", [False, True])
async def test_commit_failure_or_lost_ack_can_be_retried_without_duplicate_fact(
    client, auth_headers, assessment, monkeypatch, committed
):
    original_commit = AsyncSession.commit

    async def fail_commit(self):
        if committed:
            await original_commit(self)
        raise RuntimeError("commit acknowledgement lost")

    with monkeypatch.context() as patch:
        patch.setattr(AsyncSession, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="commit acknowledgement lost"):
            await post_submission(client, auth_headers, assessment)
    if committed:
        await assert_one_fact(assessment)
    else:
        await assert_unsubmitted(assessment)
    first = await post_submission(client, auth_headers, assessment)
    second = await post_submission(client, auth_headers, assessment)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["correct_count"] == assessment["total"]
    await assert_one_fact(assessment)


@pytest.mark.parametrize("mode", ["paper_exam", "daily_check", "wrong_redo"])
async def test_exam_event_failure_restores_claim_grades_and_exposure_for_each_mode(db_session, monkeypatch, mode):
    user = User(phone="13800009851", name="Atomic assessment")
    db_session.add(user)
    await db_session.flush()
    paper = await _seed_paper(db_session)
    session = await _start(db_session, user, paper, mode)
    uid, sid = user.id, session.id
    baseline_events = await db_session.scalar(select(func.count(LearningEvent.id)))
    baseline_exposures = await db_session.scalar(select(func.count(UserQuestionExposure.user_id)))

    async def fail(*args, **kwargs):
        raise RuntimeError("required event failed")

    with monkeypatch.context() as patch:
        patch.setattr("app.services.learning_event_service.record_event", fail)
        with pytest.raises(RuntimeError, match="required event failed"):
            await exam_service.submit_answers(db_session, session, uid, [])
    restored = await exam_service.get_attempt_detail(db_session, sid, uid)
    assert restored.submitted_at is None and restored.score is None
    assert all(answer.answered_at is None and answer.correct is None for answer in restored.answers)
    assert await db_session.scalar(select(func.count(LearningEvent.id))) == baseline_events
    assert await db_session.scalar(select(func.count(UserQuestionExposure.user_id))) == baseline_exposures
    result = await exam_service.submit_answers(db_session, restored, uid, [])
    assert result["total"] == 3
    assert await db_session.scalar(select(func.count(LearningEvent.id))) == baseline_events + 1


async def test_listening_service_refreshes_stale_state_and_never_overwrites_submitted_draft(db_session):
    user = User(phone="13800009852", name="Stale listening")
    db_session.add(user)
    await db_session.commit()
    uid = user.id
    video = await seed_video(db_session)
    stale = await listening_service.start(db_session, user, video.id, 5, False)
    await db_session.commit()
    sid = stale.id
    async with get_async_session_maker()() as writer:
        submitted = await listening_service.submit(writer, sid, uid)
        await writer.commit()
        original_results = submitted.results
    assert stale.submitted_at is None  # Proves the first identity map is stale.
    with pytest.raises(HTTPException) as caught:
        await listening_service.save(db_session, sid, uid, {}, 0)
    assert caught.value.status_code == 409
    await db_session.rollback()
    replayed = await listening_service.submit(db_session, sid, uid)
    await db_session.commit()
    assert replayed.results == original_results
    assert await db_session.scalar(select(func.count(LearningEvent.id))) == 1


@pytest.mark.parametrize("operation", ["save", "submit"])
async def test_listening_service_itself_enforces_ownership(db_session, operation):
    user = User(phone="13800009853", name="Owner")
    db_session.add(user)
    await db_session.commit()
    video = await seed_video(db_session)
    session = await listening_service.start(db_session, user, video.id, 5, False)
    await db_session.commit()
    with pytest.raises(HTTPException) as caught:
        if operation == "save":
            await listening_service.save(db_session, session.id, "stranger", {}, 0)
        else:
            await listening_service.submit(db_session, session.id, "stranger")
    assert caught.value.status_code == 404
    assert await db_session.scalar(select(func.count(LearningEvent.id))) == 0


@pytest.mark.parametrize("count", [-1, 0, listening_service.MAX_QUESTIONS + 1])
async def test_listening_service_rejects_invalid_count_before_creating_session(db_session, count):
    user = User(phone="13800009855", name="Listening bounds")
    db_session.add(user)
    await db_session.commit()
    with pytest.raises(UnprocessableEntityError):
        await listening_service.start(db_session, user, "unused-video", count, False)
    assert await db_session.scalar(select(func.count(ListeningSession.id))) == 0


@pytest.mark.parametrize("invalid", ["negative-index", "past-end", "oversized-answer", "foreign-question"])
async def test_listening_service_validates_drafts_without_writing_partial_state(db_session, invalid):
    user = User(phone="13800009856", name="Listening draft bounds")
    db_session.add(user)
    await db_session.commit()
    video = await seed_video(db_session)
    session = await listening_service.start(db_session, user, video.id, 5, False)
    await db_session.commit()
    sid = session.id
    index = -1 if invalid == "negative-index" else len(session.questions) if invalid == "past-end" else 0
    key = "foreign" if invalid == "foreign-question" else session.questions[0]["id"]
    value = "a" * (listening_service.MAX_ANSWER_LENGTH + 1) if invalid == "oversized-answer" else "draft"
    with pytest.raises(UnprocessableEntityError):
        await listening_service.save(db_session, sid, user.id, {key: value}, index)
    await db_session.commit()
    await db_session.refresh(session)
    assert session.answers == {} and session.current_index == 0
    assert session.submitted_at is None
