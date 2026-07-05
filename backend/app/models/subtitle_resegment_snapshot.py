"""Re-segmentation snapshot — full-subtitle backup for bulk re-cut + rollback.

When an admin triggers ``POST /admin/{video_id}/subtitles/resegment``, every
current subtitle row is snapshotted here (as JSON) before the re-cut replaces
them. The admin reviews the result in the editor; if it's worse, a single
``POST .../resegment/rollback`` restores the snapshot row-for-row (including
translations, which the re-cut drops because it can't auto-split Chinese).

Per-subtitle edits still go through ``SubtitleRevision``; this table is only
for the bulk row-count-changing re-segment operation.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SubtitleResegmentSnapshot(Base):
    __tablename__ = "subtitle_resegment_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Full subtitle rows at snapshot time: list of
    # {id, start_time, end_time, text_en, text_zh, sentence_index, words, ...}
    segments_json: Mapped[list] = mapped_column(JSON, nullable=False)
    # Count before the re-cut, for the review UI ("12 → 18 segments").
    before_count: Mapped[int] = mapped_column(default=0)
    after_count: Mapped[int] = mapped_column(default=0)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    applied_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rolled_back: Mapped[bool] = mapped_column(Boolean, default=False)
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
