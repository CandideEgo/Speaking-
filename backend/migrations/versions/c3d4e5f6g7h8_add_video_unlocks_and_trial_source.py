"""add user_video_unlocks + users.plan_source + videos.is_demo

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-28 10:00:00.000000

D0 membership model (产品设计规划-2026-08 §2):

- ``user_video_unlocks``: permanent per-user video access grants. Free users
  spend one of ``settings.free_monthly_unlock_quota`` monthly quotas per
  unlock; the row itself never expires. Composite PK (user_id, video_id) makes
  the unlock idempotent at the DB level; the (user_id, unlocked_at) index
  serves the monthly quota count.
- ``users.plan_source``: provenance of the Pro entitlement ("trial" / "redeem").
- ``videos.is_demo``: tutorial videos watchable without consuming quotas.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "c3d4e5f6g7h8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_video_unlocks",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("video_id", sa.String(36), sa.ForeignKey("videos.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_user_video_unlocks_user_unlocked_at",
        "user_video_unlocks",
        ["user_id", "unlocked_at"],
    )
    op.add_column("users", sa.Column("plan_source", sa.String(20), nullable=True))
    op.add_column(
        "videos",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("videos", "is_demo")
    op.drop_column("users", "plan_source")
    op.drop_index("ix_user_video_unlocks_user_unlocked_at", table_name="user_video_unlocks")
    op.drop_table("user_video_unlocks")
