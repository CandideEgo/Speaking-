"""Tests for the exam-level taxonomy (app.core.exam_levels)."""

from app.core.exam_levels import (
    EXAM_LEVEL_KEYS,
    EXAM_LEVELS,
    TARGET_LEVEL_OPTIONS,
    display_level,
    level_order,
    max_level,
    should_display,
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
