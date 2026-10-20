"""add jinshuju_payments table

Revision ID: j1i2n3s4h5u6
Revises: e2f3a4b5c6d7
Create Date: 2026-10-19 00:10:00.000000

金数据收款页成交后自动开通 Pro 的落账表（外部支付，站内不收款）。
幂等键为 ``entry_token``（金数据数据记录 token）。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "j1i2n3s4h5u6"
down_revision: str | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "jinshuju_payments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entry_token", sa.String(64), nullable=False),
        sa.Column("serial_number", sa.Integer(), nullable=False),
        sa.Column("form_token", sa.String(32), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("tier_name", sa.String(20), nullable=True),
        sa.Column("amount_fen", sa.Integer(), nullable=True),
        sa.Column("duration_days", sa.Integer(), nullable=True),
        sa.Column("trade_status", sa.String(32), nullable=True),
        sa.Column("trade_no", sa.String(64), nullable=True),
        sa.Column("payment_method", sa.String(32), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_message", sa.String(500), nullable=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.Column("entry_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("uq_jinshuju_payments_entry_token", "jinshuju_payments", ["entry_token"], unique=True)
    op.create_index("ix_jinshuju_payments_phone", "jinshuju_payments", ["phone"])
    op.create_index("ix_jinshuju_payments_status", "jinshuju_payments", ["status"])


def downgrade() -> None:
    op.drop_index("ix_jinshuju_payments_status", table_name="jinshuju_payments")
    op.drop_index("ix_jinshuju_payments_phone", table_name="jinshuju_payments")
    op.drop_index("uq_jinshuju_payments_entry_token", table_name="jinshuju_payments")
    op.drop_table("jinshuju_payments")
