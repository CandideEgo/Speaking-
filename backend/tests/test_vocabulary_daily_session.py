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


class TestDailyQuota:
    """The queue's default size comes from the user's quota (DEC-053)."""

    async def test_default_quota_is_ten_new_words(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        await _seed_words(user_id, [(f"w{i}", "new", None) for i in range(25)])

        data = (await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)).json()
        assert len(data["new_words"]) == 10
        assert data["totals"]["new_total"] == 25
        assert data["preferences"] == {
            "daily_new_target": 10,
            "daily_review_target": 20,
            "quota_min": 5,
            "quota_max": 100,
        }

    async def test_response_carries_today_counters(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        await _seed_words(user_id, [("alpha", "new", None)])

        data = (await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)).json()
        assert data["today"] == {"words_learned": 0, "rounds": 0}


async def _seed_due_words(
    user_id: str,
    specs: list[tuple[str, datetime, int, datetime | None]],
) -> None:
    """Seed due review rows: (word, next_review_at, wrong_count, last_wrong_at)."""
    async with TestSessionLocal() as db:
        for word, next_review_at, wrong_count, last_wrong_at in specs:
            db.add(
                Vocabulary(
                    user_id=user_id,
                    word=word,
                    mastery_level="learning",
                    next_review_at=next_review_at,
                    wrong_count=wrong_count,
                    last_wrong_at=last_wrong_at,
                )
            )
        await db.commit()


class TestReviewPriority:
    """复习队列排序（S6，DEC-057）：昨天错过的优先 → wrong_count 降序 → 到期时间升序。"""

    async def test_yesterdays_wrong_words_lead_by_wrong_count(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        now = datetime.now(UTC)
        # 测试用户没有 timezone 偏好 → 本地日 = UTC 日；正午 yesterday 恒在昨天的窗口内
        yesterday_noon = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=12)
        due = now - timedelta(days=5)
        await _seed_due_words(
            user_id,
            [
                ("never-wrong", due, 0, None),
                ("wrong-once-yesterday", due, 1, yesterday_noon),
                ("wrong-thrice-yesterday", due, 3, yesterday_noon),
                ("wrong-long-ago", due, 1, now - timedelta(days=10)),
            ],
        )

        resp = await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)
        words = [w["word"] for w in resp.json()["review_words"]]
        # 昨天错的排最前（错得多在前）；不是昨天错的按 wrong_count 降序、再按到期时间
        assert words == [
            "wrong-thrice-yesterday",
            "wrong-once-yesterday",
            "wrong-long-ago",
            "never-wrong",
        ]

    async def test_yesterday_priority_applies_within_same_due_day(self, client: AsyncClient, auth_headers: dict):
        """昨天错过但到期更晚的词，仍排在到期更早但没错的词之前。"""
        user_id = await _get_user_id(client, auth_headers)
        now = datetime.now(UTC)
        yesterday_noon = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=12)
        await _seed_due_words(
            user_id,
            [
                ("due-earlier-clean", now - timedelta(days=5), 0, None),
                ("due-later-wrong", now - timedelta(hours=1), 1, yesterday_noon),
            ],
        )

        resp = await client.get("/api/v1/vocabulary/daily-session", headers=auth_headers)
        words = [w["word"] for w in resp.json()["review_words"]]
        assert words == ["due-later-wrong", "due-earlier-clean"]


class TestReviewEndpoint:
    """POST /{word_id}/review 补写 wrong_count / last_wrong_at（S6，DEC-057）。"""

    async def _seed_word(self, user_id: str, **fields) -> str:
        async with TestSessionLocal() as db:
            vocab = Vocabulary(user_id=user_id, word=fields.pop("word"), **fields)
            db.add(vocab)
            await db.commit()
            return vocab.id

    async def test_wrong_review_records_error_fields(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        word_id = await self._seed_word(
            user_id, word="reviewme", mastery_level="reviewing", interval_days=7, review_count=3
        )

        resp = await client.post(f"/api/v1/vocabulary/{word_id}/review?quality=2", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["interval_days"] == 1
        assert data["wrong_count"] == 1
        assert data["last_wrong_at"] is not None

        async with TestSessionLocal() as db:
            row = await db.get(Vocabulary, word_id)
            assert row.wrong_count == 1
            assert row.last_wrong_at is not None
            assert row.interval_days == 1

    async def test_correct_review_on_fresh_word_schedules_three_days(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        word_id = await self._seed_word(user_id, word="freshword", mastery_level="new")

        resp = await client.post(f"/api/v1/vocabulary/{word_id}/review?quality=5", headers=auth_headers)
        data = resp.json()
        assert data["interval_days"] == 3
        assert data["wrong_count"] == 0
        assert data["last_wrong_at"] is None

    async def test_correct_review_after_old_wrong_climbs_error_ladder(self, client: AsyncClient, auth_headers: dict):
        user_id = await _get_user_id(client, auth_headers)
        now = datetime.now(UTC)
        word_id = await self._seed_word(
            user_id,
            word="ladderword",
            mastery_level="learning",
            wrong_count=1,
            last_wrong_at=now - timedelta(days=3),
            interval_days=1,
            review_count=2,
        )

        resp = await client.post(f"/api/v1/vocabulary/{word_id}/review?quality=5", headers=auth_headers)
        data = resp.json()
        assert data["interval_days"] == 2
        assert data["wrong_count"] == 1
