import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Float, Text, Boolean, JSON, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class VideoStatus(str, enum.Enum):
    processing = "processing"
    ready_subtitles = "ready_subtitles"  # subtitles + AI done, video not yet downloaded
    ready = "ready"
    error = "error"


class Platform(str, enum.Enum):
    youtube = "youtube"
    bilibili = "bilibili"
    douyin = "douyin"
    tiktok = "tiktok"
    twitter = "twitter"
    instagram = "instagram"
    other = "other"
    local = "local"


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    platform: Mapped[Platform] = mapped_column(SAEnum(Platform), nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    difficulty_level: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[VideoStatus] = mapped_column(
        SAEnum(VideoStatus), default=VideoStatus.processing, nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # YouTube embed support
    youtube_video_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    processing_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "lightweight" or "full"

    # CDN URLs
    video_url_480p: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    video_url_720p: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    video_url_1080p: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Metadata
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    topic_tags: Mapped[str | None] = mapped_column(String(500), nullable=True)
    quiz_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # relationships
    user = relationship("User", back_populates="videos")
    subtitles = relationship("Subtitle", back_populates="video", order_by="Subtitle.sentence_index")
    learning_records = relationship("LearningRecord", back_populates="video")
    comments = relationship("VideoComment", back_populates="video", order_by="VideoComment.published_at.desc()")
    comment_stats = relationship("VideoCommentStats", back_populates="video", uselist=False)
