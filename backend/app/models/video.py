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


class VideoReviewStatus(str, enum.Enum):
    """UGC review lifecycle for user-uploaded videos.

    - ``draft``: owner is still editing; not visible to the public.
    - ``pending_review``: owner submitted for review; admins see it in the queue.
      While pending, the public keeps watching the last approved version (if any)
      via ``published_snapshot``.
    - ``published``: admin approved; the live subtitles are the public version.
    - ``rejected``: admin rejected; owner can edit & resubmit. The public keeps
      watching the last approved snapshot (if any).

    Official (admin-seeded) videos are always publicly accessible regardless of
    this field (see ``check_video_access``); for them ``review_status`` mirrors
    ``is_published`` for consistency only.
    """

    draft = "draft"
    pending_review = "pending_review"
    published = "published"
    rejected = "rejected"


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
    # Public visibility gate — distinct from ``is_official`` (source attribution).
    # Official videos go through draft → review → publish; only published ones
    # appear on the homepage / browse feed / search. See list_public_videos and
    # the browse endpoints for the filtering.
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Set by the one-click "seed-full" admin flow: when finalize_video reaches
    # the ready step it auto-publishes (is_published=True) without a manual
    # PATCH. Default false preserves the existing review-then-publish flow.
    auto_publish: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── UGC review lifecycle (user-uploaded videos) ──
    # Stored as a plain string column (not a native enum) so migrations backfill
    # cleanly across SQLite (tests) and Postgres (prod). See VideoReviewStatus.
    review_status: Mapped[str] = mapped_column(
        String(20), default=VideoReviewStatus.draft.value, server_default="draft", nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Frozen copy of the last admin-approved subtitles (+ practice, added in 2B)
    # shown to the public while the owner edits a pending/rejected version. Null
    # until the video is first approved. Shape: {"subtitles": [...], "version": 1}.
    published_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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
    # foreign_keys disambiguates the two users FKs (user_id ownership vs
    # reviewed_by reviewer); this relationship tracks the owner.
    user = relationship("User", foreign_keys=[user_id], back_populates="videos")
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    subtitles = relationship("Subtitle", back_populates="video", order_by="Subtitle.sentence_index")
    learning_records = relationship("LearningRecord", back_populates="video")
    comments = relationship("VideoComment", back_populates="video", cascade="all, delete-orphan")
    comment_stats = relationship("VideoCommentStats", back_populates="video", uselist=False)
    favorites = relationship("UserFavorite", back_populates="video", cascade="all, delete-orphan")
    notes = relationship("UserNote", back_populates="video", cascade="all, delete-orphan")
    practice_questions = relationship("VideoPracticeQuestion", back_populates="video", cascade="all, delete-orphan")
