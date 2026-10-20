"""金数据（Jinshuju）外部收款记录 —— 自动开通 Pro 的落账表。

站内不收款（ICP 合规，见 ``settings.payments_enabled``）：会员在被托管在
金数据的收款页成交后，由后台同步任务把订单落到本表，再按买家手机号找到
SeeWord 账号延长 Pro 有效期。账号还没注册的订单保持 ``pending``，等该手机号
首次短信登录时补发（见 ``jinshuju_service.apply_pending_grants``）。

幂等键是金数据的数据记录 ``entry_token``：同一笔订单无论被 webhook 推送、
轮询同步处理多少次，都只会发放一次。
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class JinshujuPaymentStatus:
    """``JinshujuPayment.status`` 的取值（用字符串而不是 DB enum：这是外部
    系统的状态映射，未来新增状态不该再产生一次迁移）。"""

    #: 已付款且金额/档位核对通过，但手机号暂未注册 —— 等首次登录补发。
    PENDING = "pending"
    #: 已发放 Pro。
    APPLIED = "applied"
    #: 已付款但无法自动处理（档位/金额/手机号异常），留待人工核对。
    IGNORED = "ignored"
    #: 已发放后金数据侧出现退款状态（不自动回收，仅记录，人工决定是否追回）。
    REFUNDED = "refunded"
    #: 处理过程中抛错。
    ERROR = "error"


class JinshujuPayment(Base):
    __tablename__ = "jinshuju_payments"
    __table_args__ = (
        Index("uq_jinshuju_payments_entry_token", "entry_token", unique=True),
        Index("ix_jinshuju_payments_phone", "phone"),
        Index("ix_jinshuju_payments_status", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    #: 金数据的数据记录 token（稳定、唯一）——幂等键。
    entry_token: Mapped[str] = mapped_column(String(64), nullable=False)
    serial_number: Mapped[int] = mapped_column(Integer, nullable=False)
    form_token: Mapped[str] = mapped_column(String(32), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tier_name: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="月卡 / 季卡 / 年卡")
    amount_fen: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="实付金额（分）")
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trade_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    trade_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=JinshujuPaymentStatus.PENDING)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    #: 原始 entry JSON（排查用；含手机号等买家信息，不要外传）。
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    entry_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
