"""VideoScore model — per-compute scoring breakdown (P1, ADR-0011).

One row per (re)computation of a video's ``learning_score``. The latest row for
a video is the current breakdown; ``videos.score`` holds the denormalized total
for cheap list sorting. The factor columns are the 0-1 values (bonus is 0/1)
that produced ``total_score``, kept for auditability and the admin debug
endpoint — so the score can be explained, not just observed.

See ``scoring_service.compute_video_score`` + LAUNCH-SPRINT-2026-07 阶段 4.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VideoScore(Base):
    __tablename__ = "video_scores"
    __table_args__ = (Index("ix_video_scores_video_computed", "video_id", "computed_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id: Mapped[str] = mapped_column(String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    total_score: Mapped[float] = mapped_column(Float, nullable=False)
    # Per-factor values (0-1; bonus is 0 or 1). Mirror scoring_service formulas.
    ctr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    retention: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    watch_time: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    topic_match: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    quality: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    bonus: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
