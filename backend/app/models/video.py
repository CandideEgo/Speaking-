import enum
import uuid
from datetime import UTC, datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VideoStatus(str, enum.Enum):
    processing = "processing"
    ready_subtitles = "ready_subtitles"  # subtitles + AI done, video not yet downloaded
    ready = "ready"
    error = "error"


class VideoSource(str, enum.Enum):
    local = "local"
    imported = "imported"


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    video_source: Mapped[str] = mapped_column(
        SAEnum(VideoSource, name="videosource"), default=VideoSource.local, nullable=False
    )
    thumbnail_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    difficulty_level: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[VideoStatus] = mapped_column(SAEnum(VideoStatus), default=VideoStatus.processing, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    processing_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "lightweight" or "full"
    processing_step: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # CDN URLs
    video_url_480p: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    video_url_720p: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    video_url_1080p: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Metadata
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    topic_tags: Mapped[str | None] = mapped_column(String(500), nullable=True)
    quiz_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    processing_progress: Mapped[int] = mapped_column(Integer, default=0)  # 0-100 percentage

    # Comment-analysis denormalised fields (written by comment_service.analyze).
    # comment_count exists in the initial migration; comment_quality_score was
    # referenced by code but missing from the schema — added here + a migration.
    comment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comment_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    # relationships
    user = relationship("User", back_populates="videos")
    subtitles = relationship("Subtitle", back_populates="video", order_by="Subtitle.sentence_index")
    learning_records = relationship("LearningRecord", back_populates="video")
    comments = relationship("VideoComment", back_populates="video", cascade="all, delete-orphan")
    comment_stats = relationship("VideoCommentStats", back_populates="video", uselist=False)
