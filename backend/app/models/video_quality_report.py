"""VideoQualityReport model - persisted quality metrics from the pipeline.

Each transcription / translation quality check writes one row (append-only).
Read by the admin panel for quality flags, alerts, and manual review triage.

Stage values:
- ``transcription``: from ``check_transcription_quality`` (hallucination checks)
- ``translation``: from ``check_translation_quality`` (coverage / mixed / length)

Rows are append-only on purpose: re-triggers leave a new row so the admin can
see quality trends over re-runs, and so resume logic never has to mutate history.
"""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QualityStage(str, enum.Enum):
    transcription = "transcription"
    translation = "translation"


class VideoQualityReport(Base):
    __tablename__ = "video_quality_reports"
    __table_args__ = (Index("ix_vqr_video_stage", "video_id", "stage"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "transcription" | "translation" - plain string (not DB enum) for portability
    stage: Mapped[str] = mapped_column(String(20), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Translation-side coverage (0.0-1.0); NULL for transcription stage.
    coverage_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Full metric breakdown. Translation: short_ratio/mixed_ratio/
    # length_outlier_count/translated_count/total_subtitles.
    # Transcription: checks[{name,passed,detail}]/audio_duration/segment_count.
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Human-readable issue strings (empty list when passed).
    issues: Mapped[list] = mapped_column(JSON, nullable=False)

    # Transcription-side segment count; NULL for translation stage.
    segment_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
