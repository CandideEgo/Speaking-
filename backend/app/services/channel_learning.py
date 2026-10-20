"""Channel learning metadata shared by the public channel list and detail.

Why this module exists
----------------------
The channel pages must answer three questions before a click: *what is this
channel about*, *which learning need does it serve*, and *how hard is the
content on SeeWord*. That information is not stored on ``Channel`` (auto-created
author pages have no description), so it is derived from the channel's **real
public videos** (titles / topic tags / CEFR levels) plus a small, explicitly
curated profile table.

Design rules
------------
- Curated profiles are keyed by slug and are authoritative when present. They
  exist because tag-derived directions are noisy for the current catalog (e.g.
  sports highlight videos previously tagged ``news``/``movie``). Every profile
  must be supported by the channel's public videos; accents are only filled
  when the video titles explicitly name them (American / British).
- Unknown channels (new auto-created author pages) fall back to facts derived
  from their videos. Missing information stays ``None`` — never invented.
- ``video_titles`` is exposed for the channel search so Chinese keyword search
  can match actual content, not just the channel name.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable

    from app.models.video import Video

# CEFR order used for the "本站内容难度" range. Lexicographic order is identical
# for A1..C2, but keeping the explicit list centralises validation.
CEFR_ORDER = ("A1", "A2", "B1", "B2", "C1", "C2")

# Chinese labels for learning needs. Ids are stable; labels are display-only.
DIRECTION_LABELS: dict[str, str] = {
    "pronunciation": "发音",
    "daily": "日常对话",
    "interview": "访谈",
    "science": "科普",
    "speech": "演讲",
    "news": "新闻",
    "story": "故事",
    "sports": "体育",
    "entertainment": "娱乐",
    "film": "影视",
    "music": "音乐",
    "business": "商业",
}


@dataclass(frozen=True)
class ChannelProfile:
    """Curated positioning for the current catalog (evidence in comments below)."""

    positioning_zh: str
    directions: tuple[str, ...]
    # Only set when the channel's own video titles explicitly state the accent.
    accent_zh: str | None = None


# Curated profiles are intentionally data, not component logic: adding a channel
# is one row here, and no page hardcodes channel names.
# Accent evidence: the channel's public video title literally says
# "American English" / "British English". No other channel gets an accent.
CHANNEL_PROFILES: dict[str, ChannelProfile] = {
    "rachel-s-english": ChannelProfile(
        positioning_zh="美式发音与口语训练",
        directions=("pronunciation",),
        accent_zh="美式发音",
    ),
    "english-with-lucy": ChannelProfile(
        positioning_zh="英式发音与用词纠错",
        directions=("pronunciation",),
        accent_zh="英式发音",
    ),
    "mmmenglish": ChannelProfile(
        positioning_zh="英语发音与口语训练",
        directions=("pronunciation",),
    ),
    "linguamarina": ChannelProfile(
        positioning_zh="英语口语与听力训练",
        directions=("daily",),
    ),
    "learn-english-with-bob-the-canadian": ChannelProfile(
        positioning_zh="日常动作与生活英语",
        directions=("daily",),
    ),
    "easy-english": ChannelProfile(
        positioning_zh="日常场景英语对话",
        directions=("daily",),
    ),
    "ted": ChannelProfile(
        positioning_zh="演讲与观点表达",
        directions=("speech",),
    ),
    "english-speeches": ChannelProfile(
        positioning_zh="英语演讲与励志表达",
        directions=("speech",),
    ),
    "steve-kaufmann-lingosteve": ChannelProfile(
        positioning_zh="语言学习方法与经验",
        directions=("speech",),
    ),
    "the-tonight-show-starring-jimmy-fallon": ChannelProfile(
        positioning_zh="深夜脱口秀与名人访谈",
        directions=("interview", "entertainment"),
    ),
    "theellenshow": ChannelProfile(
        positioning_zh="脱口秀与名人访谈",
        directions=("interview", "entertainment"),
    ),
    "jimmy-kimmel-live": ChannelProfile(
        positioning_zh="深夜脱口秀与名人访谈",
        directions=("interview", "entertainment"),
    ),
    "the-late-late-show-with-james-corden": ChannelProfile(
        positioning_zh="脱口秀与音乐访谈",
        directions=("interview", "entertainment", "music"),
    ),
    "wired": ChannelProfile(
        positioning_zh="科技问答与名人访谈",
        directions=("interview", "science"),
    ),
    "cnbc": ChannelProfile(
        positioning_zh="商业与科技新闻解读",
        directions=("news", "business"),
    ),
    "ms-now": ChannelProfile(
        positioning_zh="美国时政新闻与访谈",
        directions=("news", "interview"),
    ),
    "fox-news": ChannelProfile(
        positioning_zh="美国时政新闻与访谈",
        directions=("news", "interview"),
    ),
    "veritasium": ChannelProfile(
        positioning_zh="科学实验与原理讲解",
        directions=("science",),
    ),
    "kurzgesagt-in-a-nutshell": ChannelProfile(
        positioning_zh="动画科普",
        directions=("science",),
    ),
    "national-geographic": ChannelProfile(
        positioning_zh="自然与野生动物纪录",
        directions=("science", "story"),
    ),
    "wwe": ChannelProfile(
        positioning_zh="职业摔角赛事与选手故事",
        directions=("sports", "story"),
    ),
    "house-of-highlights": ChannelProfile(
        positioning_zh="体育赛事集锦",
        directions=("sports",),
    ),
    "the-dodo": ChannelProfile(
        positioning_zh="动物救援故事",
        directions=("story",),
    ),
}

# Fallback for channels without a curated profile: topic tags written by the
# classifier are coarse but content-based. "educational"/"vlog" alone are not
# enough to name a learning need, so title rules below refine them.
_TOPIC_DIRECTIONS: dict[str, tuple[str, ...]] = {
    "interview": ("interview",),
    "news": ("news",),
    "ted": ("speech",),
    "speech": ("speech",),
    "tech": ("science",),
    "movie": ("film",),
}

_TITLE_DIRECTION_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "pronunciation",
        re.compile(r"pronounc|pronunciation|accent|phonetic|minimal pair", re.IGNORECASE),
    ),
    (
        "daily",
        re.compile(
            r"conversation|daily|everyday|action verbs|airport|small talk|speak english|understand natives",
            re.IGNORECASE,
        ),
    ),
    (
        "science",
        re.compile(
            r"explained|science|wildlife|nature|jaguar|crocodile|coronavirus|universe|physics|chemistry",
            re.IGNORECASE,
        ),
    ),
    ("story", re.compile(r"\bstory\b|rescue|learns what love|journey", re.IGNORECASE)),
    (
        "sports",
        re.compile(r"wwe|smackdown|highlights|innings?|dodgers|orioles|cardinals", re.IGNORECASE),
    ),
    ("music", re.compile(r"karaoke|\bmusic\b|\bsong\b", re.IGNORECASE)),
)


def _derived_directions(videos: Iterable[Video]) -> list[str]:
    """Direction ids inferred from actual topic tags / titles (fallback only)."""
    found: list[str] = []

    def add(direction: str) -> None:
        if direction in DIRECTION_LABELS and direction not in found:
            found.append(direction)

    for video in videos:
        for raw_tag in (video.topic_tags or "").split(","):
            for direction in _TOPIC_DIRECTIONS.get(raw_tag.strip().lower(), ()):
                add(direction)
        title = video.title or ""
        for direction, pattern in _TITLE_DIRECTION_RULES:
            if pattern.search(title):
                add(direction)
    return found


def channel_facts(slug: str, videos: Iterable[Video]) -> dict:
    """Facts used by both the list cards and the detail header.

    All values are grounded in the videos passed in (already filtered to the
    public set by the caller):
    - directions: curated profile, else inferred from tags/titles;
    - difficulty_range: min/max of real CEFR levels;
    - positioning_zh / accent_label: curated only (None when absent);
    - video_titles: titles for content search.
    """
    video_list = list(videos)
    profile = CHANNEL_PROFILES.get(slug)
    direction_ids = list(profile.directions) if profile else _derived_directions(video_list)

    directions = [
        {"id": direction, "label": DIRECTION_LABELS[direction]}
        for direction in direction_ids
        if direction in DIRECTION_LABELS
    ]

    levels = sorted(
        {video.difficulty_level for video in video_list if video.difficulty_level in CEFR_ORDER},
        key=CEFR_ORDER.index,
    )
    difficulty_range = {"min": levels[0], "max": levels[-1]} if levels else None

    return {
        "positioning_zh": profile.positioning_zh if profile else None,
        "learning_directions": directions,
        "difficulty_range": difficulty_range,
        "accent_label": profile.accent_zh if profile else None,
        "video_titles": [video.title for video in video_list if video.title],
    }


def recommended_start_basis(level: str | None) -> str:
    """Stable enum for the detail page's start-card label."""
    return "lowest_difficulty" if level in CEFR_ORDER else "latest"
