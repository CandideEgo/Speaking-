import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class OrderStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    expired = "expired"
    cancelled = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    order_number: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    plan: Mapped[str] = mapped_column(String(20), nullable=False)  # pro_monthly / pro_annual
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # in cents/fen
    status: Mapped[OrderStatus] = mapped_column(
        SAEnum(OrderStatus, name="orderstatus"),
        default=OrderStatus.pending,
        nullable=False,
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # relationships
    user = relationship("User", back_populates="orders")
