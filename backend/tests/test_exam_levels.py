"""Tests for the exam-level taxonomy (app.core.exam_levels)."""

import pytest

from app.core.exam_levels import (
    EXAM_LEVEL_KEYS,
    EXAM_LEVELS,
    TARGET_LEVEL_OPTIONS,
    display_level,
    level_order,
    max_level,
    normalize_levels,
    normalize_word_levels,
    should_display,
    validate_word_levels,
)


def test_level_order_ranking():
    assert level_order("zhongkao") == 1
    assert level_order("gaoKao") == 2
    assert level_order("cet4") == 3
    assert level_order("cet6") == 4
    assert level_order("ky") == 5
    assert level_order("ielts") == 6
    assert level_order("toefl") == 6  # same tier as ielts
    assert level_order("gre") == 7
    assert level_order("unknown") == 0


def test_max_level_picks_highest_difficulty():
    assert max_level(["cet4", "cet6"]) == "cet6"
    assert max_level(["gaoKao", "ielts"]) == "ielts"
    assert max_level(["cet4"]) == "cet4"
    assert max_level([]) is None


def test_display_level_returns_highest_key():
    # backend display_level returns the level key string (not a meta dict)
    assert display_level(["cet4", "cet6"]) == "cet6"
    assert display_level(["gaoKao", "ielts"]) == "ielts"
    assert display_level(["cet4"]) == "cet4"
    assert display_level([]) is None


def test_display_level_target_priority():
    # 选四级时，同时属于 [四级, 六级, 考研, 雅思] 的词应取四级（蓝色），
    # 而不是回退到最高级雅思（红色）。
    assert display_level(["cet4", "cet6", "ky", "ielts"], "cet4") == "cet4"
    # 词不含目标分级时回退最高级
    assert display_level(["cet6", "ielts"], "cet4") == "ielts"
    # 无目标时维持旧的最高级语义
    assert display_level(["cet4", "ielts"], None) == "ielts"
    assert display_level(["cet4", "ielts"]) == "ielts"


def test_should_display_uses_target_as_lower_bound():
    # target = cet4 -> show cet4 and above
    assert should_display(["cet4"], "cet4") is True
    assert should_display(["cet6"], "cet4") is True
    assert should_display(["ielts"], "cet4") is True
    # gaoKao is below cet4 -> hidden when target is cet4
    assert should_display(["gaoKao"], "cet4") is False
    # a word spanning cet4+cet6 has max=cet6 >= cet4 -> shown
    assert should_display(["cet4", "cet6"], "cet4") is True
    # target = gaoKao -> everything gaoKao and above shows
    assert should_display(["gaoKao"], "gaoKao") is True
    assert should_display(["cet6"], "gaoKao") is True
    # empty / missing
    assert should_display([], "cet4") is False
    assert should_display(["cet4"], "") is False


def test_target_options_exclude_collapsed_tiers():
    # zhongkao and toefl are annotation tags but not target options.
    keys = set(TARGET_LEVEL_OPTIONS)
    assert "zhongkao" not in keys
    assert "toefl" not in keys
    assert "cet4" in keys and "cet6" in keys and "gre" in keys


def test_taxonomy_covers_all_keys():
    assert set(EXAM_LEVELS.keys()) == set(EXAM_LEVEL_KEYS)


# --- word_levels shape (the two historical shapes and the request rule) ------


def test_normalize_levels_accepts_both_historical_shapes():
    assert normalize_levels(["cet4", "cet6"]) == ["cet4", "cet6"]
    assert normalize_levels("cet4") == ["cet4"]  # the legacy str arm
    assert normalize_levels(("cet4",)) == ["cet4"]


def test_normalize_levels_drops_unusable_members():
    assert normalize_levels(["cet4", None, "", 7, "cet6"]) == ["cet4", "cet6"]
    assert normalize_levels(None) == []
    assert normalize_levels("") == []
    assert normalize_levels([]) == []


def test_normalize_levels_is_total():
    """A read must never raise on whatever an older writer left behind."""
    for junk in (42, 3.5, True, {"a": 1}, object()):
        assert normalize_levels(junk) == []


def test_normalize_word_levels_drops_entries_with_no_levels():
    # A str value is the legacy shape; empty/None entries carry no annotation.
    assert normalize_word_levels({"fox": "cet4", "cat": [], "dog": None}) == {"fox": ["cet4"]}


def test_normalize_word_levels_tolerates_a_non_dict_field():
    for junk in (None, "cet4", [1, 2], 7):
        assert normalize_word_levels(junk) == {}


def test_validate_word_levels_accepts_known_keys_only():
    validate_word_levels(None)
    validate_word_levels({"fox": ["cet4", "gre"]})
    with pytest.raises(ValueError, match="unknown exam level"):
        validate_word_levels({"fox": ["cet5"]})
    # The legacy str shape is storage history, not a valid request.
    with pytest.raises(ValueError, match="must be a list"):
        validate_word_levels({"fox": "cet4"})
