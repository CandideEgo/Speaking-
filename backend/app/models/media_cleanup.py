"""Durable media-cleanup queue for account deletion (A08 / BE-04).

Deleting an account removes database rows, but the files those rows pointed at
(avatar, uploaded/transcoded video files, export ZIPs, historical shadowing
audio) live on disk. Doing that inline made a failed unlink a silent leak: the
user row was already gone, so nothing could ever retry it.

This table records one row per path **inside the same transaction** that deletes
the user, then the purge task drains it. A failure keeps the row pending with a
backoff, and the beat task retries until the file is gone. Rows carry an
informational ``user_id`` but **no foreign key** on purpose: the queue must
outlive the user row it is cleaning up after.

``path`` is relative to ``settings.local_media_path`` (POSIX separators) so the
queue stays valid if the media root moves; ``kind`` tells the worker whether to
unlink a file or remove a directory tree.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MediaCleanupTask(Base):
    __tablename__ = "media_cleanup_tasks"
    __table_args__ = (
        Index("ix_media_cleanup_status_next", "status", "next_attempt_at"),
        Index("ix_media_cleanup_user", "user_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    #: Informational only — deliberately no FK so the row survives the user.
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    #: Path relative to the media root, e.g. ``avatars/face.png``.
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    #: "file" or "dir".
    kind: Mapped[str] = mapped_column(String(8), nullable=False, default="file")
    #: "pending" until the path is gone; then "done".
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    #: NULL = due now; set to a future time after a failed attempt.
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
