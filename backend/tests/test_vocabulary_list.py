"""Tests for GET /api/v1/vocabulary server-side filters + pagination.

Covers the mastery/q/due_only filters and pagination contract used by the
vocabulary page pager (frontend previously hardcoded page_size=100, hiding
words beyond the first page).
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.models.learning import Vocabulary
from tests.conftest import TestSessionLocal


async def _seed_words(
    user_id: str,
    specs: list[tuple[str, str, str | None, datetime | None]],
) -> None:
    """Seed vocabulary rows: (word, mastery_level, translation, next_review_at)."""
    async with TestSessionLocal() as db:
        for word, mastery, translation, next_review_at in specs:
            db.add(
                Vocabulary(
                    user_id=user_id,
                    word=word,
                    mastery_level=mastery,
                    translation=translation,
                    next_review_at=next_review_at,
                )
            )
        await db.commit()


async def _get_user_id(client: AsyncClient, auth_headers: dict) -> str:
    me = (await client.get("/api/v1/users/me", headers=auth_headers)).json()
    return me["id"]


class TestVocabularyListFilters:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/vocabulary")
        assert resp.status_code == 401

    async def test_mastery_filter(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        await _seed_words(
            user_id,
            [
                ("alpha", "new", None, None),
                ("beta", "learning", None, None),
                ("gamma", "reviewing", None, None),
                ("delta", "mastered", None, None),
            ],
        )

        # Single level
        resp = await client.get("/api/v1/vocabulary?mastery=mastered", headers=auth_headers)
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["word"] == "delta"

        # Comma-separated (same convention as /vocabulary/words)
        resp2 = await client.get("/api/v1/vocabulary?mastery=learning,reviewing", headers=auth_headers)
        data2 = resp2.json()
        assert data2["total"] == 2
        assert {w["word"] for w in data2["items"]} == {"beta", "gamma"}

    async def test_q_search_matches_word_and_translation(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        await _seed_words(
            user_id,
            [
                ("eloquent", "new", "雄辩的", None),
                ("serendipity", "learning", "意外发现", None),
                ("quotidian", "new", "日常的", None),
            ],
        )

        # Case-insensitive word substring
        resp = await client.get("/api/v1/vocabulary?q=ELOQ", headers=auth_headers)
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["word"] == "eloquent"

        # Translation substring
        resp2 = await client.get("/api/v1/vocabulary?q=日常", headers=auth_headers)
        data2 = resp2.json()
        assert data2["total"] == 1
        assert data2["items"][0]["word"] == "quotidian"

        # No match -> empty but well-formed
        resp3 = await client.get("/api/v1/vocabulary?q=zzz", headers=auth_headers)
        assert resp3.json()["total"] == 0
        assert resp3.json()["items"] == []

    async def test_due_only_composes_with_mastery(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        now = datetime.now(UTC)
        await _seed_words(
            user_id,
            [
                # due + learning -> the only row matching both filters
                ("overdue", "learning", None, now - timedelta(days=1)),
                # due but mastered
                ("ripe", "mastered", None, now - timedelta(hours=1)),
                # learning but not due yet
                ("future", "learning", None, now + timedelta(days=3)),
                # never reviewed counts as due, but new mastery
                ("fresh", "new", None, None),
            ],
        )

        resp = await client.get("/api/v1/vocabulary?due_only=true&mastery=learning", headers=auth_headers)
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["word"] == "overdue"

    async def test_pagination_contract(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        await _seed_words(
            user_id,
            [(f"word{i:02d}", "new", None, None) for i in range(5)],
        )

        resp = await client.get("/api/v1/vocabulary?page=1&page_size=2", headers=auth_headers)
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["has_more"] is True

        # Last page: single leftover item, has_more false.
        resp2 = await client.get("/api/v1/vocabulary?page=3&page_size=2", headers=auth_headers)
        data2 = resp2.json()
        assert len(data2["items"]) == 1
        assert data2["has_more"] is False

    async def test_filter_totals_match_pager_math(self, client: AsyncClient, auth_headers: dict):
        """total must respect filters — the frontend pager computes
        totalPages from it, so a filtered total counting all words would
        render phantom empty pages."""
        user_id = await _get_user_id(client, auth_headers)
        await _seed_words(
            user_id,
            [
                ("uno", "mastered", None, None),
                ("dos", "mastered", None, None),
                ("tres", "new", None, None),
            ],
        )
        resp = await client.get(
            "/api/v1/vocabulary?mastery=mastered&page=1&page_size=10",
            headers=auth_headers,
        )
        data = resp.json()
        assert data["total"] == 2
        assert data["has_more"] is False
