import uuid
import secrets
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


def generate_code() -> str:
    """Generate a human-friendly 10-char code: XXXX-XXXX-XX"""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I to avoid confusion
    raw = "".join(secrets.choice(chars) for _ in range(10))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False, index=True, default=generate_code
    )
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="pro")
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    batch_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    used_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
