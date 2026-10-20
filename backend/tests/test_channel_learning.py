"""Pure tests for channel learning metadata (no DB).

These pin the rules the channel pages rely on:
- curated profiles are authoritative (including accent only when evidenced);
- unknown channels derive directions from real tags/titles, never invent an
  accent/positioning;
- difficulty range comes from real CEFR levels, sorted A1..C2.
"""

from types import SimpleNamespace

from app.services import channel_learning


def _video(title: str, *, difficulty: str | None = None, topics: str | None = None):
    return SimpleNamespace(title=title, difficulty_level=difficulty, topic_tags=topics)


def test_curated_profile_wins_over_noisy_tags_and_only_evidenced_accent():
    facts = channel_learning.channel_facts(
        "rachel-s-english",
        [_video("How to Pronounce SEX vs. SIX - American English", difficulty="B2", topics="news")],
    )
    assert facts["positioning_zh"] == "美式发音与口语训练"
    assert facts["learning_directions"] == [{"id": "pronunciation", "label": "发音"}]
    assert facts["accent_label"] == "美式发音"
    assert facts["difficulty_range"] == {"min": "B2", "max": "B2"}


def test_profile_without_evidence_does_not_invent_accent():
    facts = channel_learning.channel_facts(
        "mmmenglish",
        [_video("English Pronunciation Training", difficulty="B1", topics="educational")],
    )
    assert facts["accent_label"] is None
    assert facts["learning_directions"] == [{"id": "pronunciation", "label": "发音"}]


def test_unknown_channel_derives_directions_from_tags_and_titles():
    facts = channel_learning.channel_facts(
        "brand-new-author",
        [
            _video("An interview about science", topics="interview,tech"),
            _video("A conversation at the airport", topics="educational"),
        ],
    )
    assert facts["positioning_zh"] is None
    assert facts["accent_label"] is None
    assert facts["learning_directions"] == [
        {"id": "interview", "label": "访谈"},
        {"id": "science", "label": "科普"},
        {"id": "daily", "label": "日常对话"},
    ]


def test_difficulty_range_uses_real_levels_and_ignores_dirty_values():
    facts = channel_learning.channel_facts(
        "brand-new-author",
        [
            _video("One", difficulty="C1"),
            _video("Two", difficulty="A2"),
            _video("Three", difficulty="B1"),
            _video("Dirty", difficulty="CR"),
            _video("Missing", difficulty=None),
        ],
    )
    assert facts["difficulty_range"] == {"min": "A2", "max": "C1"}
    assert channel_learning.recommended_start_basis("A2") == "lowest_difficulty"
    assert channel_learning.recommended_start_basis("CR") == "latest"
    assert channel_learning.recommended_start_basis(None) == "latest"


def test_every_profile_uses_known_direction_labels():
    for slug, profile in channel_learning.CHANNEL_PROFILES.items():
        assert profile.positioning_zh.strip(), slug
        assert profile.directions, slug
        for direction in profile.directions:
            assert direction in channel_learning.DIRECTION_LABELS, (slug, direction)
