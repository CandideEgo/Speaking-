"""Tests for vocabulary quiz scoring, especially the skip-prevention rule.

submit_quiz must score unanswered questions as incorrect so users can't
inflate their score by strategically skipping hard questions.
"""

import pytest

from app.services import vocabulary_service


@pytest.mark.asyncio
async def test_submit_quiz_unanswered_questions_count_as_incorrect(client, auth_headers):
    """Skipping questions must not inflate the score.

    A 3-question quiz where the user answers only 1 correctly (skipping 2)
    must yield score=1, total=3 — not score=1, total=1.
    """
    from app.models.learning import Vocabulary
    from app.models.user import PlanType, RoleType, User
    from tests.conftest import TestSessionLocal, hash_password

    # Create a fresh user that owns the vocabulary words (SM-2 review needs ownership).
    async with TestSessionLocal() as db:
        user = User(
            email="quiz-test@example.com",
            hashed_password=hash_password("Quizpass1!"),
            name="Quiz",
            plan=PlanType.free,
            role=RoleType.user,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        user_id = user.id

        # Seed three words for the user.
        for w in ("apple", "banana", "cherry"):
            db.add(
                Vocabulary(
                    user_id=user_id,
                    word=w,
                    translation="水果",
                )
            )
        await db.commit()

    # Three stored quiz questions; user answers only the first correctly.
    questions = [
        {
            "id": "q1",
            "word": "apple",
            "quiz_type": "spelling",
            "question": "spell it",
            "options": None,
            "correct_answer_index": 0,
        },
        {
            "id": "q2",
            "word": "banana",
            "quiz_type": "spelling",
            "question": "spell it",
            "options": None,
            "correct_answer_index": 0,
        },
        {
            "id": "q3",
            "word": "cherry",
            "quiz_type": "spelling",
            "question": "spell it",
            "options": None,
            "correct_answer_index": 0,
        },
    ]
    answers = [{"question_id": "q1", "answer": "apple"}]  # only q1, correct

    # Run submit_quiz with a real DB session so SM-2 updates work.
    async with TestSessionLocal() as db:
        result = await vocabulary_service.submit_quiz(
            db=db,
            user_id=user_id,
            answers=answers,
            questions=questions,
        )

    # The fix: total reflects ALL questions, skipped ones are incorrect.
    assert result["total"] == 3, f"expected total=3 (all questions), got {result['total']}"
    assert result["score"] == 1, f"expected score=1 (only q1 correct), got {result['score']}"
    assert len(result["results"]) == 3
    # Skipped questions appear as incorrect with empty user_answer.
    skipped = [r for r in result["results"] if r["question_id"] in ("q2", "q3")]
    assert all(not r["correct"] for r in skipped)
    assert all(r["user_answer"] == "" for r in skipped)
