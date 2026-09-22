"""Tests for GET /api/v1/vocabulary/daily-session (今日训练队列).

Covers the Baicizhan-style training queue: new words (never reviewed) +
due review words, with caps, ordering, and mastered/new exclusions.
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.models.learning import Vocabulary
from tests.conftest import TestSessionLocal


async def _seed_words(
    user_id: str,
    specs: list[tuple[str, str, datetime | None]],
) -> None:
    """Seed vocabulary rows: (word, mastery_level, next_review_at)."""
    async with TestSessionLocal() as db:
        for word, mastery, next_review_at in specs:
            db.add(
                Vocabulary(
                    user_id=user_id,
                    word=word,
                    mastery_level=mastery,
                    next_review_at=next_review_at,
                )
            )
        await db.commit()


async def _get_user_id(client: AsyncClient, auth_headers: dict) -> str:
    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    return me["id"]


class TestDailySession:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/vocabulary/daily-session")
        assert resp.status_code == 401

    async def test_empty_vocabulary_returns_200_with_empty_queues(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["new_words"] == []
        assert data["review_words"] == []
        assert data["totals"] == {"new_total": 0, "due_total": 0}

    async def test_splits_new_and_review_queues(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        now = datetime.now(UTC)
        await _seed_words(
            user_id,
            [
                ("alpha", "new", None),
                ("beta", "learning", now - timedelta(days=1)),
                ("gamma", "reviewing", now + timedelta(days=1)),  # not due yet
                ("delta", "mastered", now - timedelta(days=1)),  # mastered, never due
            ],
        )

        resp = await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)
        data = resp.json()

        assert [w["word"] for w in data["new_words"]] == ["alpha"]
        assert [w["word"] for w in data["review_words"]] == ["beta"]
        assert data["totals"] == {"new_total": 1, "due_total": 1}

    async def test_caps_are_honored(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        now = datetime.now(UTC)
        await _seed_words(
            user_id,
            [(f"new{i}", "new", None) for i in range(5)]
            + [(f"due{i}", "learning", now - timedelta(days=1)) for i in range(5)],
        )

        resp = await client.get(
            "/api/v1/vocabulary/daily-session?new_count=2&review_count=3",
            headers=auth_headers,
        )
        data = resp.json()

        assert len(data["new_words"]) == 2
        assert len(data["review_words"]) == 3
        # Totals reflect the full queues, not the capped page
        assert data["totals"]["new_total"] == 5
        assert data["totals"]["due_total"] == 5

    async def test_review_queue_orders_most_overdue_first(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        now = datetime.now(UTC)
        await _seed_words(
            user_id,
            [
                ("recent", "learning", now - timedelta(hours=1)),
                ("overdue", "learning", now - timedelta(days=5)),
                ("never-reviewed", "reviewing", None),
            ],
        )

        resp = await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)
        words = [w["word"] for w in resp.json()["review_words"]]
        # nulls_first (never scheduled) then oldest next_review_at
        assert words == ["never-reviewed", "overdue", "recent"]

    async def test_new_queue_orders_oldest_first(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        async with TestSessionLocal() as db:
            for word, days_ago in [("old", 10), ("mid", 5), ("fresh", 1)]:
                db.add(
                    Vocabulary(
                        user_id=user_id,
                        word=word,
                        mastery_level="new",
                        created_at=datetime.now(UTC) - timedelta(days=days_ago),
                    )
                )
            await db.commit()

        resp = await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)
        assert [w["word"] for w in resp.json()["new_words"]] == ["old", "mid", "fresh"]

    async def test_counts_do_not_leak_other_users_words(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        now = datetime.now(UTC)
        await _seed_words(
            user_id,
            [("mine-new", "new", None), ("mine-due", "learning", now - timedelta(days=1))],
        )

        resp = await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)
        data = resp.json()
        assert all(w["word"].startswith("mine-") for w in data["new_words"] + data["review_words"])
        assert data["totals"] == {"new_total": 1, "due_total": 1}

    async def test_words_carry_flashcard_fields(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        async with TestSessionLocal() as db:
            db.add(
                Vocabulary(
                    user_id=user_id,
                    word="serendipity",
                    mastery_level="new",
                    translation="意外发现",
                    part_of_speech="noun",
                    ipa="/ˌser.ənˈdɪp.ə.ti/",
                    example_sentences=["Finding that café was pure serendipity."],
                    context_sentence="It was pure serendipity.",
                )
            )
            await db.commit()

        resp = await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)
        (word,) = resp.json()["new_words"]
        assert word["word"] == "serendipity"
        assert word["translation"] == "意外发现"
        assert word["part_of_speech"] == "noun"
        assert word["ipa"] == "/ˌser.ənˈdɪp.ə.ti/"
        assert word["example_sentences"] == ["Finding that café was pure serendipity."]
        assert word["context_sentence"] == "It was pure serendipity."
