"""add admin_settings table

Revision ID: s1e2t3t4i5n6
Revises: b1c2d3e4f5a6
Create Date: 2026-08-04 12:00:00.000000

Adds the singleton ``admin_settings`` table backing the admin console
"系统设置" page (prototype 32): 通用配置 / 质量门禁 / 视频管线.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "s1e2t3t4i5n6"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "admin_settings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        # 通用配置
        sa.Column("site_name", sa.String(length=100), nullable=False, server_default="SeeWord"),
        sa.Column("wechat_shop_url", sa.String(length=500), nullable=True),
        sa.Column("payments_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("registration_enabled", sa.Boolean(), nullable=False, server_default="true"),
        # 质量门禁
        sa.Column("quality_block_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("quality_block_threshold", sa.Numeric(4, 2), nullable=False, server_default="0.60"),
        sa.Column("quality_warn_threshold", sa.Numeric(4, 2), nullable=False, server_default="0.80"),
        sa.Column("hallucination_detection_enabled", sa.Boolean(), nullable=False, server_default="true"),
        # 视频管线
        sa.Column("translate_timeout_sec", sa.Integer(), nullable=False, server_default="1800"),
        sa.Column("download_timeout_sec", sa.Integer(), nullable=False, server_default="3600"),
        sa.Column("download_auto_retry_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("watchdog_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("admin_settings")
