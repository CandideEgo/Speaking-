"""Add user_milestones and mastery_snapshots tables

Sprint 4 (E4): 掌握度可视化 + 成就系统
  user_milestones — one-time achievements (vocab_50, streak_7_days, etc.)
  mastery_snapshots — daily mastery_by_level snapshot for trend chart

Revision ID: f4g5h6i7j8k9
Revises: e3f4g5h6i7j8
Create Date: 2026-07-25 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "f4g5h6i7j8k9"
down_revision: str | None = "e3f4g5h6i7j8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_milestones",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("milestone_type", sa.String(length=32), nullable=False, index=True),
        sa.Column(
            "achieved_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.UniqueConstraint("user_id", "milestone_type", name="uq_milestone_user_type"),
    )

    op.create_table(
        "mastery_snapshots",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("snapshot_date", sa.Date(), nullable=False, index=True),
        sa.Column("mastery_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "snapshot_date", name="uq_snapshot_user_date"),
    )


def downgrade() -> None:
    op.drop_table("mastery_snapshots")
    op.drop_table("user_milestones")
