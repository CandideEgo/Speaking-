"""Vocabulary progress and required learning facts commit or roll back together."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session_maker
from app.models.learning import Vocabulary
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.study_session import StudySession, StudySessionItem
from app.models.user import User
from app.models.vocab_set import VocabSet, VocabSetWord
from app.services import (
    learning_event_service,
    milestone_service,
    practice_service,
    study_session_service,
    vocab_set_service,
    vocabulary_service,
)
from app.services.local_time import get_user_local_date


async def seed(db):
    user = User(phone="13800009841", name="Atomic Vocabulary")
    db.add(user)
    await db.flush()
    word = Vocabulary(user_id=user.id, word="atomic", mastery_level="learning", review_count=1)
    db.add(word)
    await db.commit()
    return user.id, word.id


async def fail_snapshot(*args, **kwargs):
    # This is late enough that the word, event and profile have all been written.
    raise RuntimeError("snapshot unavailable")


async def assert_unchanged(uid, wid):
    async with get_async_session_maker()() as db:
        word = await db.get(Vocabulary, wid)
        assert word.review_count == 1
        assert word.mastery_level == "learning"
        assert word.correct_count == 0
        assert word.last_reviewed_at is None
        assert await db.scalar(select(func.count(LearningEvent.id)).where(LearningEvent.user_id == uid)) == 0
        assert await db.scalar(select(UserLearningProfile).where(UserLearningProfile.user_id == uid)) is None


@pytest.mark.parametrize("operation", ["review", "mastered"])
async def test_caller_rollback_undoes_word_event_and_profile(db_session, operation):
    uid, wid = await seed(db_session)
    if operation == "review":
        assert await vocabulary_service.record_review(db_session, uid, wid, 5)
    else:
        assert await vocabulary_service.mark_mastered(db_session, uid, wid)
    await db_session.rollback()
    await assert_unchanged(uid, wid)


@pytest.mark.parametrize("operation", ["review", "mastered"])
async def test_required_event_failure_prevents_partial_word_success(db_session, monkeypatch, operation):
    uid, wid = await seed(db_session)
    monkeypatch.setattr(milestone_service, "ensure_today_snapshot", fail_snapshot)
    with pytest.raises(RuntimeError, match="snapshot unavailable"):
        if operation == "review":
            await vocabulary_service.record_review(db_session, uid, wid, 5)
        else:
            await vocabulary_service.mark_mastered(db_session, uid, wid)
    await db_session.rollback()
    await assert_unchanged(uid, wid)


async def test_mastery_repeat_records_one_fact_and_missing_ownership_records_none(db_session):
    uid, wid = await seed(db_session)
    assert await vocabulary_service.mark_mastered(db_session, "another-user", wid) is None
    assert await vocabulary_service.record_review(db_session, uid, "missing-word", 5) is None
    assert await vocabulary_service.mark_mastered(db_session, uid, wid)
    await db_session.commit()
    assert await vocabulary_service.mark_mastered(db_session, uid, wid)
    await db_session.commit()
    events = (await db_session.scalars(select(LearningEvent).where(LearningEvent.user_id == uid))).all()
    assert [(event.event_type, event.event_value, event.source) for event in events] == [
        ("learned_words", 1, "vocabulary")
    ]
    profile = await db_session.scalar(select(UserLearningProfile).where(UserLearningProfile.user_id == uid))
    assert profile.today_words_learned == 1


async def test_legacy_emitter_keeps_business_write_and_rolls_back_failed_projection(db_session, monkeypatch):
    uid, wid = await seed(db_session)
    word = await db_session.get(Vocabulary, wid)
    word.translation = "persist this independent change"
    monkeypatch.setattr(milestone_service, "ensure_today_snapshot", fail_snapshot)
    await learning_event_service.emit_event(db_session, uid, "reviewed_words")
    await db_session.commit()
    assert (await db_session.get(Vocabulary, wid)).translation == "persist this independent change"
    assert await db_session.scalar(select(func.count(LearningEvent.id))) == 0
    assert await db_session.scalar(select(func.count(UserLearningProfile.id))) == 0


@pytest.mark.parametrize("event_type", ["unknown-event", "teaching_attempt"])
async def test_required_emitter_rejects_invalid_or_wrong_domain_facts(db_session, event_type):
    uid, _ = await seed(db_session)
    with pytest.raises(ValueError):
        await learning_event_service.record_event(db_session, uid, event_type)
    assert await db_session.scalar(select(func.count(LearningEvent.id))) == 0


async def test_training_answer_failure_rolls_back_item_round_and_word(db_session, monkeypatch):
    uid, wid = await seed(db_session)
    session = StudySession(user_id=uid, local_date=await get_user_local_date(db_session, uid), target_count=1)
    db_session.add(session)
    await db_session.flush()
    item = StudySessionItem(session_id=session.id, vocabulary_id=wid, sort_order=0)
    db_session.add(item)
    await db_session.commit()
    sid, iid = session.id, item.id
    monkeypatch.setattr(milestone_service, "ensure_today_snapshot", fail_snapshot)
    with pytest.raises(RuntimeError, match="snapshot unavailable"):
        await study_session_service.submit_answer(db_session, uid, sid, wid, True)
    await db_session.rollback()
    await assert_unchanged(uid, wid)
    assert (await db_session.get(StudySession, sid)).done_count == 0
    item = await db_session.get(StudySessionItem, iid)
    assert item.status == "pending" and item.correct_streak == 0


async def test_batch_second_fact_failure_rolls_back_whole_batch(db_session, monkeypatch):
    uid, wid = await seed(db_session)
    original = learning_event_service.record_event

    async def fail_second(db, user_id, event_type, *args, **kwargs):
        if event_type == learning_event_service.EVENT_LEARNED_WORDS:
            raise RuntimeError("second fact failed")
        await original(db, user_id, event_type, *args, **kwargs)

    monkeypatch.setattr(learning_event_service, "record_event", fail_second)
    monkeypatch.setattr("app.services.ecdict.lookup", lambda word: None)
    with pytest.raises(RuntimeError, match="second fact failed"):
        await practice_service.submit_practice_results(
            db_session, uid, [{"word": "atomic", "correct": True}, {"word": "newword", "correct": True}]
        )
    await db_session.rollback()
    await assert_unchanged(uid, wid)
    assert await db_session.scalar(select(Vocabulary).where(Vocabulary.word == "newword")) is None


async def test_batch_repeated_word_correct_answers_are_each_counted_once(db_session):
    uid, wid = await seed(db_session)
    word = await db_session.get(Vocabulary, wid)
    word.mastery_level = "new"
    word.review_count = 0
    await db_session.commit()
    await practice_service.submit_practice_results(
        db_session, uid, [{"word": "atomic", "correct": True}, {"word": "atomic", "correct": True}], flow_id="batch-1"
    )
    await db_session.refresh(word)
    assert word.correct_count == 2
    assert word.review_count == 2
    events = (await db_session.scalars(select(LearningEvent))).all()
    assert {(e.event_type, e.event_value, e.flow_id) for e in events} == {
        ("practiced_items", 2, "batch-1"),
        ("learned_words", 2, "batch-1"),
    }


@pytest.mark.parametrize("operation", ["sieve", "learned"])
async def test_set_closure_failure_cannot_commit_mastery_without_fact(db_session, monkeypatch, operation):
    uid, wid = await seed(db_session)
    vocab_set = VocabSet(user_id=uid, name="Atomic set", source_type="exam", exam_level="cet4")
    db_session.add(vocab_set)
    await db_session.flush()
    sw = VocabSetWord(set_id=vocab_set.id, vocabulary_id=wid, position=0, status="unknown")
    db_session.add(sw)
    await db_session.commit()
    sid, swid = vocab_set.id, sw.id
    user = await db_session.get(User, uid)
    monkeypatch.setattr(milestone_service, "ensure_today_snapshot", fail_snapshot)
    with pytest.raises(RuntimeError, match="snapshot unavailable"):
        if operation == "sieve":
            await vocab_set_service.sieve_judge(db_session, user, sid, swid, True)
        else:
            await vocab_set_service.mark_learned(db_session, user, sid, swid)
    await db_session.rollback()
    await assert_unchanged(uid, wid)
    assert (await db_session.get(VocabSetWord, swid)).status == "unknown"


@pytest.mark.parametrize("operation", ["review?quality=5", "mastered"])
async def test_http_commit_failure_leaves_no_word_or_learning_changes(client, auth_headers, monkeypatch, operation):
    uid = (await client.get("/api/v1/users/me", headers=auth_headers)).json()["id"]
    async with get_async_session_maker()() as db:
        word = Vocabulary(user_id=uid, word="atomic", mastery_level="learning", review_count=1)
        db.add(word)
        await db.commit()
        wid = word.id

    async def failed_commit(self):
        raise RuntimeError("database commit failed")

    monkeypatch.setattr(AsyncSession, "commit", failed_commit)
    with pytest.raises(RuntimeError, match="database commit failed"):
        await client.post(f"/api/v1/vocabulary/{wid}/{operation}", headers=auth_headers)
    await assert_unchanged(uid, wid)


async def test_set_reclosure_recognizes_legacy_fact_without_flow_id(db_session):
    uid, wid = await seed(db_session)
    vocab_set = VocabSet(user_id=uid, name="Legacy set", source_type="exam", exam_level="cet4")
    db_session.add(vocab_set)
    await db_session.flush()
    sw = VocabSetWord(set_id=vocab_set.id, vocabulary_id=wid, position=0, status="unknown")
    db_session.add(sw)
    db_session.add(
        LearningEvent(
            user_id=uid,
            event_type="learned_words",
            event_date=datetime.now(UTC).date(),
            event_metadata={"set_id": vocab_set.id},
        )
    )
    await db_session.commit()
    result = await vocab_set_service.mark_learned(db_session, await db_session.get(User, uid), vocab_set.id, sw.id)
    await db_session.commit()
    assert result["completed"]
    assert await db_session.scalar(select(func.count(LearningEvent.id))) == 1
