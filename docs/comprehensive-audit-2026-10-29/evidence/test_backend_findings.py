"""Read-only audit reproductions: in-memory SQLite + fake Redis only.

Run from backend with PYTHONUTF8=1:
  .venv/Scripts/python.exe -m pytest -c pytest.ini -p tests.conftest ../docs/comprehensive-audit-2026-10-29/evidence/test_backend_findings.py -q -s

These assertions describe observed defects; passing is evidence of the defect,
not an acceptance test for the desired implementation.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.api.v1 import auth
from app.core.security import create_token, decode_token
from app.models.behavior import BehaviorEvent
from app.models.learning import LearningRecord
from app.models.video import Video, VideoStatus
from tests.test_internal_callback import (
    CALLBACK_URL,
    _headers,
    _payload,
    _seed_video,
    _video_state,
    callback_secret,
    redis_lock,
)


async def test_audit_callback_commit_then_failed_enqueue_is_not_retried(
    client, monkeypatch, callback_secret, redis_lock
):
    from app.tasks.video_processing import finalize_video

    video_id = await _seed_video()
    attempts = []

    def broker_down(*args, **kwargs):
        attempts.append(args)
        raise RuntimeError("audit: broker unavailable")

    monkeypatch.setattr(finalize_video, "delay", broker_down)
    with pytest.raises(RuntimeError, match="audit: broker unavailable"):
        await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers())
    first_state = await _video_state(video_id)
    second = await client.post(CALLBACK_URL, json=_payload(video_id), headers=_headers())
    assert first_state[0] == "ready_subtitles"
    assert second.status_code == 200
    assert second.json()["acknowledged"] is True
    assert len(attempts) == 1
    print({"finding": "callback-lost-tail", "state_after_failed_enqueue": first_state, "retry_status": second.status_code, "enqueue_attempts": len(attempts)})


async def test_audit_overview_uses_lifetime_seconds_for_this_week(client, auth_headers, db_session):
    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    now = datetime.now(UTC)
    video = Video(title="Audit overview", source_url="https://example.com/audit.mp4", status=VideoStatus.ready)
    db_session.add(video)
    await db_session.flush()
    db_session.add(LearningRecord(user_id=me["id"], video_id=video.id, time_spent_seconds=99999, last_accessed_at=now))
    db_session.add_all([
        BehaviorEvent(user_id=me["id"], event_type="watch_time", event_payload={"delta_s": 300}, server_ts=now - timedelta(minutes=2)),
        BehaviorEvent(user_id=me["id"], event_type="watch_time", event_payload={"delta_s": 300}, server_ts=now - timedelta(days=14)),
    ])
    await db_session.commit()
    overview = (await client.get("/api/v1/users/me/overview", headers=auth_headers)).json()
    weekly = (await client.get("/api/v1/learning/stats/weekly", headers=auth_headers)).json()
    assert overview["this_week"]["minutes"] == 1666
    assert weekly["this_week_minutes"] == 5
    print({"finding": "overview-weekly-mismatch", "overview_this_week_minutes": overview["this_week"]["minutes"], "weekly_endpoint_minutes": weekly["this_week_minutes"]})


async def test_audit_concurrent_refresh_can_both_rotate_same_token(client, auth_headers, monkeypatch):
    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    token = create_token(me["id"], token_type="refresh")
    ready = asyncio.Event()
    arrivals = 0

    async def both_read_not_revoked(jti):
        nonlocal arrivals
        arrivals += 1
        if arrivals == 2:
            ready.set()
        await ready.wait()
        return False

    monkeypatch.setattr(auth, "is_token_blacklisted", both_read_not_revoked)
    responses = await asyncio.gather(*[
        client.post("/api/v1/auth/refresh", json={"refresh_token": token}) for _ in range(2)
    ])
    assert [r.status_code for r in responses] == [200, 200]
    new_ids = [decode_token(r.json()["refresh_token"])["jti"] for r in responses]
    assert len(set(new_ids)) == 2
    print({"finding": "refresh-check-set-race", "statuses": [r.status_code for r in responses], "distinct_new_refresh_tokens": len(set(new_ids))})


async def test_audit_two_preloaded_exam_submissions_create_duplicate_answers(client, auth_headers, db_session):
    from sqlalchemy import func, select

    from app.models.exam_test import ExamAnswer, ExamQuestion
    from app.services import exam_service
    from tests.conftest import TestSessionLocal
    from tests.test_exams_api import _seed_paper

    paper = await _seed_paper(db_session)
    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    created = (await client.post(f"/api/v1/exams/{paper.id}/attempts", headers=auth_headers)).json()
    questions = (await db_session.execute(select(ExamQuestion).where(ExamQuestion.paper_id == paper.id))).scalars().all()
    answers = [{"question_id": q.id, "answer": q.answer} for q in questions]
    # Deterministic race interleaving: two request-scoped sessions both read
    # before either submits; writes then run sequentially to avoid pretending
    # SQLite exercises PostgreSQL locking semantics.
    async with TestSessionLocal() as first_db, TestSessionLocal() as second_db:
        first = await exam_service.get_attempt_detail(first_db, created["session_id"], me["id"])
        second = await exam_service.get_attempt_detail(second_db, created["session_id"], me["id"])
        assert first.submitted_at is None and second.submitted_at is None
        await exam_service.submit_answers(first_db, first, me["id"], answers)
        await exam_service.submit_answers(second_db, second, me["id"], answers)
    async with TestSessionLocal() as check_db:
        count = await check_db.scalar(select(func.count()).select_from(ExamAnswer).where(ExamAnswer.session_id == created["session_id"]))
    assert count == 6
    print({"finding": "exam-stale-submit-duplicates", "questions": 3, "persisted_answer_rows": count, "accepted_submissions": 2})


async def test_audit_account_purge_leaves_legacy_recording(client, auth_headers, db_session, monkeypatch, tmp_path):
    from app.models.user import User
    from app.tasks import account_tasks

    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    recording = tmp_path / "shadowing" / me["id"] / "legacy.webm"
    recording.parent.mkdir(parents=True)
    recording.write_bytes(b"audit recording placeholder")
    monkeypatch.setattr(account_tasks, "_media_root", lambda: tmp_path)
    user = await db_session.get(User, me["id"])
    await account_tasks._purge_user(db_session, user)
    assert recording.exists()
    assert await db_session.get(User, me["id"]) is None
    print({"finding": "legacy-recording-purge-gap", "account_deleted": True, "recording_remaining": recording.exists()})


async def test_audit_password_schema_accepts_bcrypt_rejected_length(client, auth_headers):
    import bcrypt

    from app.schemas.user import ChangePasswordRequest

    long_password = "Aa1" + "x" * 80
    parsed = ChangePasswordRequest(current_password="Testpass123!", new_password=long_password)
    assert parsed.new_password == long_password
    with pytest.raises(ValueError, match="72 bytes"):
        await client.post("/api/v1/auth/change-password", headers=auth_headers, json=parsed.model_dump())
    print({"finding": "password-byte-limit", "bcrypt_version": bcrypt.__version__, "schema_accepted_bytes": len(long_password.encode()), "request_raises": "ValueError: password cannot be longer than 72 bytes"})
