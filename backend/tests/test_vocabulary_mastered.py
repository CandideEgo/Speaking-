"""Tests for POST /api/v1/vocabulary/{word_id}/mastered.

One-click 已掌握 from the word bank: sets the level directly (no SM-2
grading), clears next_review_at so due queues never resurface the word, and
leaves the word visible under the mastered filter.
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.models.learning import Vocabulary
from tests.conftest import TestSessionLocal


async def _seed_word(user_id: str, word: str, mastery: str = "learning") -> None:
    async with TestSessionLocal() as db:
        db.add(
            Vocabulary(
                user_id=user_id,
                word=word,
                mastery_level=mastery,
                next_review_at=datetime.now(UTC) - timedelta(days=1),
            )
        )
        await db.commit()


async def _get_user_id(client: AsyncClient, auth_headers: dict) -> str:
    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    return me["id"]


class TestMarkMastered:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/vocabulary/whatever/mastered")
        assert resp.status_code == 401

    async def test_marks_mastered_and_exits_due_queue(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        await _seed_word(user_id, "ephemeral")

        # Find the word id via the list endpoint
        resp = await client.get("/api/v1/vocabulary?q=ephemeral", headers=auth_headers)
        word_id = resp.json()["items"][0]["id"]

        resp = await client.post(f"/api/v1/vocabulary/{word_id}/mastered", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["mastery_level"] == "mastered"

        # Shows up under the mastered filter
        resp = await client.get("/api/v1/vocabulary?mastery=mastered&q=ephemeral", headers=auth_headers)
        assert resp.json()["total"] == 1

        # But never in the due queue, whatever next_review_at said
        resp = await client.get("/api/v1/vocabulary?due_only=true&q=ephemeral", headers=auth_headers)
        assert resp.json()["total"] == 0

    async def test_idempotent_for_already_mastered(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        await _seed_word(user_id, "redundant", mastery="mastered")

        resp = await client.get("/api/v1/vocabulary?q=redundant", headers=auth_headers)
        word_id = resp.json()["items"][0]["id"]

        resp = await client.post(f"/api/v1/vocabulary/{word_id}/mastered", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["mastery_level"] == "mastered"

    async def test_404_for_missing_word(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/v1/vocabulary/does-not-exist/mastered", headers=auth_headers)
        assert resp.status_code == 404
