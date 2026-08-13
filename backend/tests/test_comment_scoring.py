"""Comment quality scoring tests (pure functions).

The comment quality pipeline runs in a Celery task that conftest stubs out,
so these scoring functions were never executed by tests — the keyword
relevance / depth / engagement / weighted-total logic is covered directly.
"""

from app.models.comment import VideoComment
from app.services.comment_service import (
    _calculate_depth_score,
    _calculate_learning_relevance_score,
    _count_keywords,
    calculate_overall_quality_score,
)


def _comment(text: str, likes: int = 0, replies: int = 0) -> VideoComment:
    return VideoComment(
        video_id="v1",
        external_id="ext-1",
        text=text,
        like_count=likes,
        reply_count=replies,
    )


def test_count_keywords_tiers():
    counts = _count_keywords("I love this video! vocabulary is amazing")
    assert counts["high"] >= 1  # "vocabulary" is a high-tier learning keyword
    assert _count_keywords("lol nice")["low"] >= 1  # "lol" is a low-tier keyword


def test_learning_relevance_prefers_learning_comments():
    learning = [_comment("Great vocabulary and pronunciation tips!"), _comment("The grammar explanation was helpful")]
    spam = [_comment("first"), _comment("lol")]

    learning_score, _ = _calculate_learning_relevance_score(learning)
    spam_score, _ = _calculate_learning_relevance_score(spam)
    assert learning_score > spam_score
    assert 0 <= learning_score <= 100


def test_learning_relevance_empty():
    score, counts = _calculate_learning_relevance_score([])
    assert score == 0
    assert counts == {"high": 0, "medium": 0, "low": 0}


def test_depth_score_ranks_rich_comments():
    rich = [_comment("I think the key point is practice every day. What about you?")]
    terse = [_comment("ok")]
    assert _calculate_depth_score(rich) > _calculate_depth_score(terse)
    assert _calculate_depth_score([]) == 0


def test_overall_quality_score_weighting():
    # 0.4/0.3/0.3 weighted, truncated to int
    assert calculate_overall_quality_score(100, 100, 100) == 100
    assert calculate_overall_quality_score(50, 0, 0) == 20
    assert calculate_overall_quality_score(0, 100, 0) == 30
    assert calculate_overall_quality_score(0, 0, 100) == 30
