import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Float, Text, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class VideoComment(Base):
    """YouTube comment extracted for quality analysis."""

    __tablename__ = "video_comments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # YouTube comment ID for deduplication
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    # Parent comment ID for replies
    parent_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Author info (denormalized for YouTube comments)
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Comment content
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Engagement metrics
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    reply_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamp from source
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Unique constraint: one video cannot have duplicate external comments
    __table_args__ = (
        UniqueConstraint("video_id", "external_id", name="uq_video_comment_external"),
    )

    # relationships
    video = relationship("Video", back_populates="comments")


class VideoCommentStats(Base):
    """Aggregated comment quality analysis results for a video."""

    __tablename__ = "video_comment_stats"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, unique=True
    )

    # Basic stats
    total_comments: Mapped[int] = mapped_column(Integer, default=0)
    total_likes: Mapped[int] = mapped_column(Integer, default=0)
    avg_comment_length: Mapped[float] = mapped_column(Float, default=0)

    # Quality dimension scores (0-100)
    learning_relevance_score: Mapped[int] = mapped_column(Integer, default=0)
    depth_score: Mapped[int] = mapped_column(Integer, default=0)
    engagement_score: Mapped[int] = mapped_column(Integer, default=0)

    # Overall weighted score (0-100)
    overall_quality_score: Mapped[int] = mapped_column(Integer, default=0)

    # Keyword stats (JSON: {"high": 12, "medium": 5, "low": 3})
    keyword_stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Metadata
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # relationships
    video = relationship("Video", back_populates="comment_stats")
