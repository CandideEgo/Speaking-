"""BehaviorEvent model — P0 behavior collection (ADR-0011).

One row per user interaction (click/play/pause/seek/complete/watch_time).
High-write log table; uses auto-increment BigInteger PK (not UUID). Anonymous
events allowed (user_id NULL). Side-effects (time_spent/completed/view_count)
are mirrored onto LearningRecord/Video by behavior_service on ingest, not
stored redundantly here.
"""

from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class BehaviorEvent(Base):
    __tablename__ = "behavior_events"
    __table_args__ = (
        Index("ix_behavior_events_user_server", "user_id", "server_ts"),
        Index("ix_behavior_events_video_type", "video_id", "event_type"),
        # Weekly play ranking: event_type IN ('play','complete') AND
        # server_ts >= Monday, grouped by video_id.
        Index("ix_behavior_events_server_ts_type", "server_ts", "event_type"),
        # Client-generated event id (A02): the unique index is what makes ingest
        # idempotent — a retried or double-delivered batch cannot accumulate the
        # same watch_time twice. Historical rows are NULL, which is allowed to
        # repeat under a unique index in both PostgreSQL and SQLite.
        Index("uq_behavior_events_event_id", "event_id", unique=True),
    )

    # SQLite (tests) only auto-increments an exact INTEGER PRIMARY KEY, so the
    # BigInteger PK falls back to Integer there — production (Postgres) keeps
    # BIGINT autoincrement.
    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    event_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
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
