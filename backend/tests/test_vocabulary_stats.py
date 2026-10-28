"""Vocabulary stats: the top-bar due chip has one canonical number."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.models.learning import Vocabulary
from tests.conftest import TestSessionLocal


async def _user_id(client: AsyncClient, headers: dict) -> str:
    return (await client.get("/api/v1/users/me", headers=headers)).json()["id"]


class TestVocabularyStatsDue:
    async def test_due_review_excludes_new_and_mastered(self, client: AsyncClient, auth_headers: dict):
        user_id = await _user_id(client, auth_headers)
        past = datetime.now(UTC) - timedelta(days=1)
        async with TestSessionLocal() as db:
            db.add_all(
                [
                    Vocabulary(user_id=user_id, word="new-word", mastery_level="new"),
                    Vocabulary(
                        user_id=user_id,
                        word="learning-due",
                        mastery_level="learning",
                        next_review_at=past,
                    ),
                    Vocabulary(
                        user_id=user_id,
                        word="reviewing-due",
                        mastery_level="reviewing",
                        next_review_at=None,
                    ),
                    Vocabulary(
                        user_id=user_id,
                        word="mastered-due",
                        mastery_level="mastered",
                        next_review_at=past,
                    ),
                ]
            )
            await db.commit()

        data = (await client.get("/api/v1/vocabulary/stats", headers=auth_headers)).json()
        assert data["total"] == 4
        assert data["new_count"] == 1
        assert data["mastered_count"] == 1
        # Legacy count still folds new words in (compat).
        assert data["due_count"] == 3
        # Canonical review queue: new and mastered excluded.
        assert data["due_review_count"] == 2
