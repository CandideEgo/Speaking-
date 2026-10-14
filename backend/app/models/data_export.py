"""Async data-export task model (P1-7 异步数据导出).

One row per ``GET /users/me/export`` request. The Celery task
``app.tasks.account_tasks.build_user_export`` flips ``status`` from
``pending`` to ``running`` to ``ready`` (or ``failed`` after exhausting
retries) and writes the ZIP under the local media volume.

The download URL is short-lived and single-use: ``GET /users/me/export/{id}``
returns a fresh token (default 15 min TTL, first read only) and the raw bytes
are served by the export download endpoint, which consumes the token.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


class DataExportTask(Base):
    __tablename__ = "data_export_tasks"
    __table_args__ = (Index("ix_data_export_tasks_user_created", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # pending | running | ready | failed
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    # Relative path under the local media volume (e.g. "exports/<user>/<id>.zip").
    file_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # One-time short-lived download handshake.
    download_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    download_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user = relationship("User")
