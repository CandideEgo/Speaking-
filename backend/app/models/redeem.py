import enum
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RedeemStatus(str, enum.Enum):
    """Redeem-code lifecycle (ADR-0007).

    unused -> redeemed (success, terminal)
    unused -> revoked  (admin voids a leaked/erroneous code; terminal)
    unused -> expired  (auto, > N days unused; terminal)
    redeemed -> revoked (refund clawback; terminal)
    """

    unused = "unused"
    redeemed = "redeemed"
    revoked = "revoked"
    expired = "expired"


class RevokedReason(str, enum.Enum):
    """Why a code was revoked. Only meaningful when status == revoked."""

    leak = "leak"  # code leaked / sent to wrong person (admin voids before use)
    error = "error"  # generated in error (admin voids before use)
    refund = "refund"  # refund clawback on an already-redeemed code


def generate_code() -> str:
    """Generate a human-friendly 10-char code: XXXX-XXXX-XX"""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I to avoid confusion
    raw = "".join(secrets.choice(chars) for _ in range(10))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


class RedeemCode(Base):
    """A redeem code = one Pro grant (default 30 days). Redeem-only payment
    instrument (no online payment per compliance). See ADR-0007 + CONTEXT.md.
    """

    __tablename__ = "redeem_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True, default=generate_code)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="pro")
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    batch_label: Mapped[str | None] = mapped_column(String(100), nullable=True)

    status: Mapped[RedeemStatus] = mapped_column(
        SAEnum(RedeemStatus, name="redeemstatus"),
        nullable=False,
        default=RedeemStatus.unused,
        server_default="unused",
    )
    revoked_reason: Mapped[RevokedReason | None] = mapped_column(
        SAEnum(RevokedReason, name="revokedreason"),
        nullable=True,
        default=None,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    used_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
