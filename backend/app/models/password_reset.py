import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # bcrypt hash of the raw token, used for the final verification step.
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Deterministic lookup key (SHA-256 of the raw token, hex). Indexed so the
    # reset endpoint can find the candidate row in O(1) instead of bcrypt-verifying
    # every unexpired token (O(n) slow + timing leak). The raw token is still
    # never stored; token_hash remains the authoritative check.
    token_lookup: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    # relationships
    user = relationship("User", backref="password_reset_tokens")
