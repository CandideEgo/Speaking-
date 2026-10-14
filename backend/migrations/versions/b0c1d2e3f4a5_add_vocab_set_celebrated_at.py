"""add vocab_sets.celebrated_at

Revision ID: b0c1d2e3f4a5
Revises: a0b1c2d3e4f5
Create Date: 2026-10-14 10:05:00.000000

P1-6: 集合闭环庆祝。第一次闭环时盖时间戳；幂等庆祝端点据此只发一次卡片。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b0c1d2e3f4a5"
down_revision: str | None = "a0b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("vocab_sets", sa.Column("celebrated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("vocab_sets", "celebrated_at")
