"""BehaviorEvent model — P0 behavior collection (ADR-0011).

One row per user interaction (click/play/pause/seek/complete/watch_time).
High-write log table; uses auto-increment BigInteger PK (not UUID). Anonymous
events allowed (user_id NULL). Side-effects (time_spent/completed/view_count)
are mirrored onto LearningRecord/Video by behavior_service on ingest, not
stored redundantly here.
"""

from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class BehaviorEvent(Base):
    __tablename__ = "behavior_events"
    __table_args__ = (
        Index("ix_behavior_events_user_server", "user_id", "server_ts"),
        Index("ix_behavior_events_video_type", "video_id", "event_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    video_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    event_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    client_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    server_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
