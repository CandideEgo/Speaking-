"""add users deletion fields and data_export_tasks

Revision ID: c0d1e2f3a4b5
Revises: b0c1d2e3f4a5
Create Date: 2026-10-14 10:10:00.000000

P1-7: 30 天可撤回注销（users.deletion_* 三列）+ 异步数据导出任务表。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "c0d1e2f3a4b5"
down_revision: str | None = "b0c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("deletion_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("deletion_scheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("deletion_reason", sa.String(500), nullable=True))

    op.create_table(
        "data_export_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("file_path", sa.String(1000), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("download_token", sa.String(64), nullable=True, unique=True),
        sa.Column("download_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_data_export_tasks_user_id", "data_export_tasks", ["user_id"])
    op.create_index("ix_data_export_tasks_user_created", "data_export_tasks", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_data_export_tasks_user_created", table_name="data_export_tasks")
    op.drop_index("ix_data_export_tasks_user_id", table_name="data_export_tasks")
    op.drop_table("data_export_tasks")
    op.drop_column("users", "deletion_reason")
    op.drop_column("users", "deletion_scheduled_at")
    op.drop_column("users", "deletion_requested_at")
