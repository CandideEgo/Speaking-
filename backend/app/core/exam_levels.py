"""Exam level taxonomy for the CET / 高考 / 考研 vocabulary feature.

Canonical level keys are derived from ECDICT's ``tag`` field (mapped in
``app/services/ecdict.py``). This module defines the difficulty ordering and
the display rule used by both backend (annotation filtering, gloss API) and
the mirrored frontend constants in ``frontend/src/lib/examLevels.ts``.

Display rule: a word is shown when its highest level order >= the user's
target level order; the highlight color is taken from that highest level.
"""

from __future__ import annotations

# Canonical level key -> metadata.
# `order` defines difficulty ranking (lower = easier). ielts/toefl share order 6
# so they are treated as the same tier for display/filtering.
EXAM_LEVELS: dict[str, dict[str, object]] = {
    "zhongkao": {"label": "中考", "order": 1, "color": "slate"},
    "gaoKao": {"label": "高考", "order": 2, "color": "green"},
    "cet4": {"label": "四级", "order": 3, "color": "blue"},
    "cet6": {"label": "六级", "order": 4, "color": "purple"},
    "ky": {"label": "考研", "order": 5, "color": "orange"},
    "ielts": {"label": "雅思", "order": 6, "color": "red"},
    "toefl": {"label": "托福", "order": 6, "color": "red"},
    "gre": {"label": "GRE", "order": 7, "color": "rose"},
}

# All valid level keys (used for schema validation).
EXAM_LEVEL_KEYS: list[str] = list(EXAM_LEVELS.keys())

# Levels offered as a user "target" in the UI selector. zhongkao/toefl are
# annotation tags but not primary target options (toefl is covered by ielts tier).
TARGET_LEVEL_OPTIONS: list[str] = ["gaoKao", "cet4", "cet6", "ky", "ielts", "gre"]


def level_order(level: str) -> int:
    """Difficulty order rank of a level key. Unknown keys rank 0 (lowest)."""
    info = EXAM_LEVELS.get(level)
    return int(info["order"]) if info else 0


def max_level(levels: list[str]) -> str | None:
    """The highest-difficulty level key among the given keys, or None."""
    if not levels:
        return None
    return max(levels, key=level_order)


def should_display(word_levels: list[str], target_level: str) -> bool:
    """Display rule: word's max level order >= target level order."""
    if not word_levels or not target_level:
        return False
    top = max_level(word_levels)
    return top is not None and level_order(top) >= level_order(target_level)


def display_level(word_levels: list[str]) -> str | None:
    """The level key whose color should be used to highlight the word."""
    return max_level(word_levels)
