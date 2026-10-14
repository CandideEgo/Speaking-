"""add user_preferences.auto_advance_on_correct

Revision ID: a0b1c2d3e4f5
Revises: k6l7m8n9o0p1
Create Date: 2026-10-14 10:00:00.000000

P1-5: 词汇训练「答对自动前进」开关。独立列（非通知 JSON），默认 False，
不改变既有训练手感；开启后前端答对约 800ms 前进，答错保持手动。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a0b1c2d3e4f5"
down_revision: str | None = "k6l7m8n9o0p1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("auto_advance_on_correct", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "auto_advance_on_correct")
