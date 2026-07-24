"""Tests for video difficulty auto-computation (Sprint 3, Task 3.1).

Covers the pure computation logic (word_levels → CEFR mapping) and the
async DB integration (compute_video_difficulty writes only when null).
"""

import pytest
from sqlalchemy import select

from app.core.security import hash_password
from app.models.subtitle import Subtitle
from app.models.user import PlanType, RoleType, User
from app.models.video import Video, VideoStatus
from app.services.difficulty_service import (
    compute_difficulty_from_word_levels,
    compute_video_difficulty,
)

# --- Pure computation tests ---


class TestComputeDifficultyFromWordLevels:
    """Unit tests for the pure function (no DB)."""

    def test_empty_list_returns_none(self):
        assert compute_difficulty_from_word_levels([]) is None

    def test_all_none_returns_none(self):
        assert compute_difficulty_from_word_levels([None, None, None]) is None

    def test_too_few_words_returns_none(self):
        # Only 2 annotated words — below the threshold of 3.
        wl = {"hello": ["gaoKao"], "world": ["cet4"]}
        assert compute_difficulty_from_word_levels([wl]) is None

    def test_zhongkao_words_map_to_a1(self):
        # All words are zhongkao (order 1) → p75 = 1.0 → A1
        wl = {f"w{i}": ["zhongkao"] for i in range(10)}
        assert compute_difficulty_from_word_levels([wl]) == "A1"

    def test_gaokao_words_map_to_a2(self):
        # All words are gaoKao (order 2) → p75 = 2.0 → A2
        wl = {f"w{i}": ["gaoKao"] for i in range(10)}
        assert compute_difficulty_from_word_levels([wl]) == "A2"

    def test_cet4_words_map_to_b1(self):
        # All words are cet4 (order 3) → p75 = 3.0 → B1
        wl = {f"w{i}": ["cet4"] for i in range(10)}
        assert compute_difficulty_from_word_levels([wl]) == "B1"

    def test_cet6_words_map_to_b2(self):
        # All words are cet6 (order 4) → p75 = 4.0 → B2
        wl = {f"w{i}": ["cet6"] for i in range(10)}
        assert compute_difficulty_from_word_levels([wl]) == "B2"

    def test_ky_words_map_to_c1(self):
        # All words are ky (order 5) → p75 = 5.0 → C1
        wl = {f"w{i}": ["ky"] for i in range(10)}
        assert compute_difficulty_from_word_levels([wl]) == "C1"

    def test_gre_words_map_to_c2(self):
        # All words are gre (order 7) → p75 = 7.0 → C2
        wl = {f"w{i}": ["gre"] for i in range(10)}
        assert compute_difficulty_from_word_levels([wl]) == "C2"

    def test_mixed_levels_uses_p75(self):
        # 8 words: 4 cet4 (order 3) + 4 cet6 (order 4)
        # sorted orders: [3,3,3,3,4,4,4,4], p75 index = 0.75*7 = 5.25 → 4
        # → B2
        wl = {}
        for i in range(4):
            wl[f"easy{i}"] = ["cet4"]
        for i in range(4):
            wl[f"hard{i}"] = ["cet6"]
        assert compute_difficulty_from_word_levels([wl]) == "B2"

    def test_multiple_subtitles_accumulate(self):
        # Subtitle 1: 5 gaoKao words; Subtitle 2: 5 cet6 words
        # sorted: [2,2,2,2,2,4,4,4,4,4], p75 index = 0.75*9 = 6.75 → 4
        # → B2
        wl1 = {f"w{i}": ["gaoKao"] for i in range(5)}
        wl2 = {f"h{i}": ["cet6"] for i in range(5)}
        assert compute_difficulty_from_word_levels([wl1, wl2]) == "B2"

    def test_word_with_multiple_levels_takes_max(self):
        # Word tagged with both cet4 and cet6 → max order = 4
        wl = {f"w{i}": ["cet4", "cet6"] for i in range(5)}
        assert compute_difficulty_from_word_levels([wl]) == "B2"

    def test_empty_level_lists_ignored(self):
        wl = {"w1": [], "w2": ["cet4"], "w3": [], "w4": ["cet4"], "w5": ["cet4"]}
        assert compute_difficulty_from_word_levels([wl]) == "B1"


# --- DB integration tests ---


async def _ensure_user(db_session) -> User:
    """Get or create the test user."""
    user = (await db_session.execute(select(User).where(User.phone == "13800138000"))).scalar_one_or_none()
    if user is None:
        user = User(
            phone="13800138000",
            hashed_password=hash_password("Testpass123!"),
            name="Test User",
            plan=PlanType.free,
            role=RoleType.user,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
    return user


async def _make_video_with_subtitles(db_session, word_levels_list: list[dict | None]) -> str:
    """Create a video + subtitles with given word_levels. Returns video_id."""
    user = await _ensure_user(db_session)
    v = Video(
        title="Difficulty Test Video",
        source_url="https://www.youtube.com/watch?v=difficulty_test",
        video_source="imported",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
        user_id=user.id,
    )
    db_session.add(v)
    await db_session.flush()

    for i, wl in enumerate(word_levels_list):
        db_session.add(
            Subtitle(
                video_id=v.id,
                start_time=i * 3.0,
                end_time=(i + 1) * 3.0,
                text_en=f"Sentence {i}",
                sentence_index=i,
                word_levels=wl,
            )
        )
    await db_session.commit()
    return v.id


@pytest.mark.asyncio
async def test_compute_video_difficulty_writes_level(db_session):
    """Videos with null difficulty get a computed CEFR level."""
    wl = {f"word{i}": ["cet4"] for i in range(10)}
    video_id = await _make_video_with_subtitles(db_session, [wl, wl])

    result = await compute_video_difficulty(db_session, video_id)
    assert result == "B1"

    # Verify persisted
    video = await db_session.scalar(select(Video).where(Video.id == video_id))
    assert video.difficulty_level == "B1"


@pytest.mark.asyncio
async def test_compute_video_difficulty_does_not_overwrite(db_session):
    """Manually-set difficulty_level is never overwritten."""
    wl = {f"word{i}": ["cet4"] for i in range(10)}
    video_id = await _make_video_with_subtitles(db_session, [wl])

    # Manually set to C1
    video = await db_session.scalar(select(Video).where(Video.id == video_id))
    video.difficulty_level = "C1"
    await db_session.commit()

    result = await compute_video_difficulty(db_session, video_id)
    assert result == "C1"  # unchanged


@pytest.mark.asyncio
async def test_compute_video_difficulty_insufficient_data(db_session):
    """Videos with too few annotated words keep null difficulty."""
    wl = {"only": ["cet4"], "two": ["cet6"]}  # 2 words < threshold of 3
    video_id = await _make_video_with_subtitles(db_session, [wl])

    result = await compute_video_difficulty(db_session, video_id)
    assert result is None

    video = await db_session.scalar(select(Video).where(Video.id == video_id))
    assert video.difficulty_level is None


@pytest.mark.asyncio
async def test_compute_video_difficulty_no_subtitles(db_session):
    """Videos with no subtitles keep null difficulty."""
    user = await _ensure_user(db_session)
    v = Video(
        title="No Subs Video",
        source_url="https://www.youtube.com/watch?v=no_subs",
        video_source="imported",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
        user_id=user.id,
    )
    db_session.add(v)
    await db_session.commit()

    result = await compute_video_difficulty(db_session, v.id)
    assert result is None
