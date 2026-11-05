"""PostgreSQL evidence for concurrent vocabulary/round/set transactions."""

import asyncio

import pytest
from sqlalchemy import func, select

from app.core.database import get_async_session_maker
from app.models.learning import Vocabulary
from app.models.learning_plan import LearningEvent, UserLearningProfile
from app.models.study_session import StudySession, StudySessionItem
from app.models.user import User
from app.models.vocab_set import VocabSet, VocabSetWord
from app.services import practice_service, study_session_service, vocab_set_service, vocabulary_service
from app.services.local_time import get_user_local_date

pytestmark = pytest.mark.integration


async def seed(count=1):
    async with get_async_session_maker()() as db:
        user = User(phone="13800009842", name="PG Vocabulary")
        db.add(user)
        await db.flush()
        words = [Vocabulary(user_id=user.id, word=f"word{i}", mastery_level="learning") for i in range(count)]
        db.add_all(words)
        await db.commit()
        return user.id, [word.id for word in words]


async def race(uid, word_ids, action):
    """Both sessions load stale state before either takes its mutation locks."""
    barrier = asyncio.Barrier(2)

    async def run(index):
        async with get_async_session_maker()() as db:
            # Keep strong references so identity-map refresh is actually tested.
            loaded = list((await db.scalars(select(Vocabulary).where(Vocabulary.id.in_(word_ids)))).all())
            await barrier.wait()
            result = await action(db, index)
            await db.commit()
            assert loaded
            return result

    return await asyncio.wait_for(asyncio.gather(run(0), run(1)), timeout=20)


async def test_same_mastery_transition_counts_once_under_concurrency():
    uid, ids = await seed()

    async def mark(db, index):
        return await vocabulary_service.mark_mastered(db, uid, ids[0])

    await race(uid, ids, mark)
    async with get_async_session_maker()() as db:
        assert (await db.get(Vocabulary, ids[0])).mastery_level == "mastered"
        assert await db.scalar(select(func.count(LearningEvent.id))) == 1
        profile = await db.scalar(select(UserLearningProfile).where(UserLearningProfile.user_id == uid))
        assert profile.today_words_learned == 1


@pytest.mark.parametrize("same_word", [True, False])
async def test_round_answers_preserve_progress_and_count_first_answer_once(same_word):
    uid, ids = await seed(1 if same_word else 2)
    async with get_async_session_maker()() as db:
        session = StudySession(user_id=uid, local_date=await get_user_local_date(db, uid), target_count=len(ids))
        db.add(session)
        await db.flush()
        db.add_all(
            [StudySessionItem(session_id=session.id, vocabulary_id=wid, sort_order=i) for i, wid in enumerate(ids)]
        )
        await db.commit()
        sid = session.id

    async def answer(db, index):
        return await study_session_service.submit_answer(db, uid, sid, ids[0 if same_word else index], True)

    await race(uid, ids, answer)
    async with get_async_session_maker()() as db:
        session = await db.get(StudySession, sid)
        assert session.done_count == len(ids)
        assert session.correct_count == 2
        assert await db.scalar(select(func.count(LearningEvent.id))) == len(ids)
        profile = await db.scalar(select(UserLearningProfile).where(UserLearningProfile.user_id == uid))
        assert profile.today_words_learned == len(ids)
        words = list((await db.scalars(select(Vocabulary))).all())
        assert sum(word.review_count for word in words) == 2


@pytest.mark.parametrize("same_word", [True, False])
async def test_concurrent_set_closure_records_exactly_one_whole_set_fact(same_word):
    uid, ids = await seed(1 if same_word else 2)
    async with get_async_session_maker()() as db:
        vocab_set = VocabSet(user_id=uid, name="PG set", source_type="exam", exam_level="cet4")
        db.add(vocab_set)
        await db.flush()
        rows = [
            VocabSetWord(set_id=vocab_set.id, vocabulary_id=wid, position=i, status="unknown")
            for i, wid in enumerate(ids)
        ]
        db.add_all(rows)
        await db.commit()
        sid, swids = vocab_set.id, [row.id for row in rows]

    async def close(db, index):
        user = await db.get(User, uid)
        if index == 0:
            return await vocab_set_service.mark_learned(db, user, sid, swids[0])
        return await vocab_set_service.sieve_judge(db, user, sid, swids[0 if same_word else 1], True)

    await race(uid, ids, close)
    async with get_async_session_maker()() as db:
        events = list((await db.scalars(select(LearningEvent))).all())
        assert len(events) == 1
        assert events[0].event_value == len(ids)
        assert events[0].event_metadata["set_id"] == sid
        assert events[0].flow_id == sid
        profile = await db.scalar(select(UserLearningProfile).where(UserLearningProfile.user_id == uid))
        assert profile.today_words_learned == len(ids)


async def test_overlapping_batches_with_reverse_input_order_do_not_deadlock_or_lose_reviews():
    uid, ids = await seed(2)

    async def submit(db, index):
        words = ["word0", "word1"] if index == 0 else ["word1", "word0"]
        return await practice_service.submit_practice_results(
            db, uid, [{"word": word, "correct": True} for word in words], flow_id=f"batch-{index}"
        )

    await race(uid, ids, submit)
    async with get_async_session_maker()() as db:
        words = list((await db.scalars(select(Vocabulary))).all())
        assert all(word.review_count == 2 and word.correct_count == 2 for word in words)
        assert await db.scalar(select(func.count(LearningEvent.id))) == 4
        profile = await db.scalar(select(UserLearningProfile).where(UserLearningProfile.user_id == uid))
        assert profile.today_words_learned == 4


async def test_required_review_and_learning_projection_rollback_together():
    uid, ids = await seed()
    async with get_async_session_maker()() as db:
        assert await vocabulary_service.record_review(db, uid, ids[0], 5)
        await db.rollback()
    async with get_async_session_maker()() as db:
        word = await db.get(Vocabulary, ids[0])
        assert word.review_count == 0 and word.correct_count == 0
        assert await db.scalar(select(func.count(LearningEvent.id))) == 0
        assert await db.scalar(select(func.count(UserLearningProfile.id))) == 0
