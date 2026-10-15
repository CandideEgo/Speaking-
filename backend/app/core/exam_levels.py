"""Exam level taxonomy for the CET / 高考 / 考研 vocabulary feature.

Canonical level keys are derived from ECDICT's ``tag`` field (mapped in
``app/services/ecdict.py``). This module defines the difficulty ordering and
the display rule used by both backend (annotation filtering, gloss API) and
the frontend.

**This module is the single source for the taxonomy.** The frontend table is
generated from it into ``frontend/src/lib/examLevels.generated.ts`` by
``backend/scripts/generate_exam_levels.py``, and
``tests/test_exam_levels_generated.py`` fails if the two drift. So: add or
rename a level here, then run that script — do not hand-edit the generated file
(colors and the display rules stay hand-written on the frontend side).

Display rule: a word is shown when its highest level order >= the user's
target level order. Color rule: the user's target level takes priority when
the word belongs to it; otherwise the color falls back to the highest level.
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


def display_level(word_levels: list[str], target_level: str | None = None) -> str | None:
    """The level key whose color should be used to highlight the word.

    Target-priority rule: when ``target_level`` is provided and the word
    belongs to it, that level wins (e.g. target cet4 + word in
    [cet4, ielts] → cet4 blue instead of ielts red). Otherwise falls back
    to the word's highest level. Mirrors frontend ``displayLevel`` in
    ``frontend/src/lib/examLevels.ts``.
    """
    if target_level and target_level in word_levels:
        return target_level
    return max_level(word_levels)


# ---------------------------------------------------------------------------
# word_levels shape — the annotation field on Subtitle
# ---------------------------------------------------------------------------
#
# ``Subtitle.word_levels`` is a plain ``JSON`` column: nothing between a writer
# and the database enforces its shape. The canonical shape is
# ``{surface token: [level keys]}``, which is what every writer produces today
# (``app/services/ecdict.py::levels_of`` → ``list[str]``).  A bare ``str`` per
# entry has also been accepted defensively since the feature landed (``8db75a6``
# added the ``elif isinstance(levels, str)`` arm to the consumer), and that
# tolerance had been copy-pasted into a second consumer
# (``app/services/vocab_set_service.py``).  These three functions replace the
# copies: one home for the shape, read by every consumer, plus the column type
# in ``app/models/types.py`` that stops new bad shapes from being written.


def normalize_levels(value: object) -> list[str]:
    """Canonical ``list[str]`` for one ``word_levels`` entry's value.

    Total by construction — a read must never raise on data an old writer left
    behind. ``None`` and anything unrecognized normalize to ``[]`` (the entry
    then gets dropped by :func:`normalize_word_levels`), so a row with an
    unexpected value degrades to "no annotation" instead of failing the request.

    The ``str`` arm is **temporary**: it exists only because the shape census
    over historical rows has not been run. Once
    ``scripts/backfill_word_levels.py`` has been run and its census reports 0
    non-array entries, delete that arm — not before, or a legacy row silently
    loses its annotation.
    """
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, (list, tuple, set)):
        return [v for v in value if isinstance(v, str) and v]
    return []


def normalize_word_levels(field: object) -> dict[str, list[str]]:
    """Canonical ``{token: [level keys]}`` for a whole ``word_levels`` field.

    Non-dict input and entries that normalize to no levels are dropped, so an
    empty result means "no annotations at all" — writers store that as SQL NULL
    (see ``app/models/types.py``), which is also how the column's NULL and an
    empty dict have always been treated interchangeably.
    """
    if not isinstance(field, dict):
        return {}
    normalized = {str(token): normalize_levels(levels) for token, levels in field.items()}
    return {token: levels for token, levels in normalized.items() if levels}


def validate_word_levels(field: dict[str, list[str]] | None) -> None:
    """Raise ``ValueError`` unless every entry holds known level list keys.

    Stricter than :func:`normalize_word_levels` on purpose, and only for
    **requests** (``app/schemas/video.py``), where a wrong key is the caller's
    typo and a 422 with the allowed set is the useful answer. Storage keeps the
    tolerant normalizer: a highlight that never matches is a rendering loss, not
    a reason to fail a request that is otherwise fine.
    """
    if field is None:
        return
    allowed = set(EXAM_LEVEL_KEYS)
    for token, levels in field.items():
        if not isinstance(levels, list):
            raise ValueError(f"levels for {token!r} must be a list")
        for level in levels:
            if level not in allowed:
                raise ValueError(f"unknown exam level {level!r} (allowed: {sorted(allowed)})")
