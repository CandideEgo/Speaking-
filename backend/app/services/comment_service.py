import re
from datetime import UTC, datetime

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import VideoComment, VideoCommentStats
from app.models.video import Video

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Keyword dictionaries for quality scoring
# ---------------------------------------------------------------------------

LEARNING_KEYWORDS = {
    "high": [
        # English learning direct
        "english",
        "learn",
        "learning",
        "study",
        "pronunciation",
        "accent",
        "vocabulary",
        "grammar",
        "speaking",
        "listening",
        "fluency",
        "comprehension",
        "practice",
        "improve",
        # Chinese equivalents
        "英语",
        "学习",
        "发音",
        "口语",
        "听力",
        "单词",
        "语法",
        "词汇",
        "练习",
        "提高",
        "流利",
        "理解",
    ],
    "medium": [
        # Content appreciation / inspiration
        "inspiring",
        "motivational",
        "insightful",
        "thought-provoking",
        "useful",
        "helpful",
        "informative",
        "educational",
        "启发",
        "感动",
        "受益",
        "深刻",
        "有用",
        "有帮助",
        "感谢",
        "谢谢",
        "appreciate",
        "thanks",
    ],
    "low": [
        # Low-value / spam indicators
        "first",
        "early",
        "here",
        "lol",
        "haha",
        "lmao",
        "omg",
        "来了",
        "第一",
        "沙发",
        "哈哈哈",
        "呵呵",
        "666",
        "who's watching",
        "anyone",
        "2024",
        "2025",
        "2026",
    ],
}

# Regex to detect URLs
URL_PATTERN = re.compile(r"https?://\S+|www\.\S+")


def _count_keywords(text: str) -> dict[str, int]:
    """Count keyword occurrences in comment text (case-insensitive)."""
    text_lower = text.lower()
    return {tier: sum(1 for kw in keywords if kw in text_lower) for tier, keywords in LEARNING_KEYWORDS.items()}


def _calculate_learning_relevance_score(
    comments: list[VideoComment],
) -> tuple[int, dict[str, int]]:
    """Score 0-100: how many comments are relevant to English learning.

    Returns (score, keyword_counts).
    """
    if not comments:
        return 0, {"high": 0, "medium": 0, "low": 0}

    total_high = total_medium = total_low = 0
    for c in comments:
        counts = _count_keywords(c.text)
        total_high += counts["high"]
        total_medium += counts["medium"]
        total_low += counts["low"]

    n = len(comments)
    # Normalize: high=3pts, medium=1pt, low=-2pts per comment
    raw = (total_high * 3 + total_medium * 1 - total_low * 2) / n
    score = max(0, min(100, int(raw * 10)))

    return score, {"high": total_high, "medium": total_medium, "low": total_low}


def _calculate_depth_score(comments: list[VideoComment]) -> int:
    """Score 0-100: comment depth indicators (length, questions, sentences)."""
    if not comments:
        return 0

    n = len(comments)
    total_length = sum(len(c.text) for c in comments)
    avg_length = total_length / n

    questions = sum(1 for c in comments if "?" in c.text)
    sentences = sum(1 for c in comments if "." in c.text or "!" in c.text)
    urls = sum(1 for c in comments if URL_PATTERN.search(c.text))

    # Length contribution: 0-40 pts (avg 200 chars = 40 pts)
    length_score = min(40, avg_length / 5)

    # Question ratio: 0-30 pts
    question_score = (questions / n) * 30

    # Sentence ratio: 0-20 pts
    sentence_score = (sentences / n) * 20

    # URL ratio: 0-10 pts
    url_score = (urls / n) * 10

    return int(length_score + question_score + sentence_score + url_score)


def _calculate_engagement_score(comments: list[VideoComment]) -> int:
    """Score 0-100: engagement quality (likes, replies, diversity)."""
    if not comments:
        return 0

    n = len(comments)
    total_likes = sum(c.like_count for c in comments)
    avg_likes = total_likes / n

    replies = sum(1 for c in comments if c.reply_count > 0)
    high_likes = sum(1 for c in comments if c.like_count >= 100)

    # Average likes: 0-20 pts (avg 50 likes = 20 pts)
    like_score = min(20, avg_likes / 2.5)

    # Reply ratio: 0-30 pts
    reply_score = (replies / n) * 30

    # High-like ratio: 0-30 pts
    high_like_score = (high_likes / n) * 30

    # Diversity heuristic: longer comments tend to be more diverse
    # Use avg length as proxy: 0-20 pts
    avg_length = sum(len(c.text) for c in comments) / n
    diversity_score = min(20, avg_length / 10)

    return int(like_score + reply_score + high_like_score + diversity_score)


def calculate_overall_quality_score(
    learning_score: int,
    depth_score: int,
    engagement_score: int,
) -> int:
    """Weighted overall quality score.

    Weights: learning 40%, depth 30%, engagement 30%.
    """
    return int(learning_score * 0.4 + depth_score * 0.3 + engagement_score * 0.3)


class CommentService:
    """Analyze and manage video comments for quality assessment."""

    def __init__(self):
        pass

    async def fetch_and_store_comments(
        self,
        db: AsyncSession,
        video_id: str,
        comments_data: list[dict],
    ) -> list[VideoComment]:
        """Store pre-fetched comments in DB.

        Args:
            db: Database session.
            video_id: Internal video ID.
            comments_data: List of comment dicts with keys: external_id, text,
                           author_name, like_count, reply_count, published_at.

        Returns:
            The stored VideoComment objects.
        """
        # Delete existing comments for this video (refresh)
        await db.execute(delete(VideoComment).where(VideoComment.video_id == video_id))
        await db.commit()

        if not comments_data:
            logger.warning("no comments provided for video", video_id=video_id)
            return []

        # Store in DB
        stored: list[VideoComment] = []
        for raw in comments_data:
            comment = VideoComment(
                video_id=video_id,
                external_id=raw["external_id"],
                text=raw["text"],
                author_name=raw.get("author_name"),
                like_count=raw.get("like_count", 0),
                reply_count=raw.get("reply_count", 0),
                published_at=_parse_iso_datetime(raw.get("published_at", "")),
            )
            db.add(comment)
            stored.append(comment)

        await db.commit()
        for c in stored:
            await db.refresh(c)

        logger.info(
            "stored comments for video",
            count=len(stored),
            video_id=video_id,
        )
        return stored

    async def analyze_video_comments(
        self,
        db: AsyncSession,
        video_id: str,
    ) -> VideoCommentStats | None:
        """Run quality analysis on stored comments and save results.

        Returns the VideoCommentStats record or None if no comments.
        """
        # Load comments
        result = await db.execute(select(VideoComment).where(VideoComment.video_id == video_id))
        comments = result.scalars().all()

        if not comments:
            logger.info("no comments to analyze for video", video_id=video_id)
            return None

        # Calculate scores
        learning_score, keyword_stats = _calculate_learning_relevance_score(comments)
        depth_score = _calculate_depth_score(comments)
        engagement_score = _calculate_engagement_score(comments)
        overall_score = calculate_overall_quality_score(learning_score, depth_score, engagement_score)

        total_likes = sum(c.like_count for c in comments)
        avg_length = sum(len(c.text) for c in comments) / len(comments)

        # Upsert stats
        result = await db.execute(select(VideoCommentStats).where(VideoCommentStats.video_id == video_id))
        stats = result.scalar_one_or_none()

        if stats is None:
            stats = VideoCommentStats(video_id=video_id)
            db.add(stats)

        stats.total_comments = len(comments)
        stats.total_likes = total_likes
        stats.avg_comment_length = round(avg_length, 1)
        stats.learning_relevance_score = learning_score
        stats.depth_score = depth_score
        stats.engagement_score = engagement_score
        stats.overall_quality_score = overall_score
        stats.keyword_stats = keyword_stats
        stats.analyzed_at = datetime.now(UTC)

        # Update video table for quick querying
        video_result = await db.execute(select(Video).where(Video.id == video_id))
        video = video_result.scalar_one_or_none()
        if video:
            video.comment_quality_score = overall_score
            # Note: do NOT overwrite video.comment_count here — that column
            # tracks community comments and is managed by community_service.
            # The YouTube comment count is len(comments) but is not stored
            # separately at this time.

        await db.commit()
        await db.refresh(stats)

        logger.info(
            "analyzed comments for video",
            video_id=video_id,
            overall_score=overall_score,
            learning_score=learning_score,
            depth_score=depth_score,
            engagement_score=engagement_score,
        )
        return stats

    async def get_quality_score(self, db: AsyncSession, video_id: str) -> int | None:
        """Get cached quality score for a video."""
        result = await db.execute(
            select(VideoCommentStats.overall_quality_score).where(VideoCommentStats.video_id == video_id)
        )
        return result.scalar_one_or_none()


def _parse_iso_datetime(value: str) -> datetime | None:
    """Parse ISO 8601 datetime string."""
    if not value:
        return None
    try:
        # Handle 'Z' suffix
        value = value.replace("Z", "+00:00")
        return datetime.fromisoformat(value)
    except ValueError:
        return None
