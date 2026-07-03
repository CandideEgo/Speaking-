"""Subtitle change proposals (PRs) — fork holders propose edits to the standard.

A fork holder who has improved their fork's subtitles can submit a PR to merge
those edits back into the URL's standard version body. Admins review/merge/
reject; the submitter can withdraw. On merge, changes are written back to the
standard body line-by-line and propagated to other forks (决议 2 按行传播).

Lifecycle (决议 8): ``pending → merged | rejected`` + ``withdrawn``. No draft
state — unsubmitted fork edits ARE the draft. Batch granularity (one PR carries
many line changes); diff/merge is per-line. Submitter = a fork holder of that
URL's standard. Admin edits to the standard body do not need a PR (决议 5).

``changes`` is ``[{sentence_index, before: {field: old}, after: {field: new}}]`` —
``before``/``after`` are field deltas (same shape as ``SubtitleRevision``), so
merge reuses the audit writer. See docs/plans/PIPELINE-RESUME-DEDUP-AUDIT.md
Phase 3e and ADR-0006.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SubtitleChangeProposal(Base):
    __tablename__ = "subtitle_change_proposals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    standard_video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Redundant with standard_video.source_url, denormalised for URL-keyed PR queries.
    source_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    submitted_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{sentence_index, before: {field: old}, after: {field: new}}, ...].
    changes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # pending | merged | rejected | withdrawn (决议 8)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    reviewed_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)
