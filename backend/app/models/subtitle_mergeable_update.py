"""Per-fork-per-line "mergeable update" marker.

When a PR merges a change to a standard version body, the change propagates to
that URL's forks (决议 2). For forks that have NOT edited the affected line, the
new value syncs automatically (writing a ``scope="sync"`` SubtitleRevision).
For forks that HAVE edited it (a ``scope="fork"`` SubtitleRevision exists), we
write a MergeableUpdate row instead — the fork's owner is prompted in the
creator center and decides whether to pull the update.

Unique on (fork_video_id, fork_subtitle_id): one pending marker per line.
Cleared when the owner applies the update (or the subtitle/video is deleted).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SubtitleMergeableUpdate(Base):
    __tablename__ = "subtitle_mergeable_updates"
    __table_args__ = (UniqueConstraint("fork_video_id", "fork_subtitle_id", name="uq_mergeable_fork_subtitle"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    fork_video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fork_subtitle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("subtitles.id", ondelete="CASCADE"), nullable=False
    )
    # Redundant with fork_subtitle.sentence_index — kept for cheap queries.
    sentence_index: Mapped[int] = mapped_column(Integer, nullable=False)
    standard_revision_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("subtitle_revisions.id", ondelete="CASCADE"), nullable=False
    )
    proposal_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("subtitle_change_proposals.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
