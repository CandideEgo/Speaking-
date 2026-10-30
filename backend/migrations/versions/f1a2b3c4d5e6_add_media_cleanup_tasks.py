"""新增 media_cleanup_tasks：注销后媒体清理的可重试队列（A08/BE-04）。

注销账号时数据库行随事务删除，但头像、上传/转码视频、导出 ZIP、历史跟读
录音仍在磁盘上。原先的内联 unlink 失败只写一行日志：用户行已经没了，之后
再也没有重试入口。这张表在**删除用户的同一事务**里记录待删路径，提交后由
注销任务与 beat 重试任务依次处理；失败保留 pending 并退避。

``user_id`` 故意不建外键：队列必须比它清理的用户行活得更久。
``path`` 相对 ``settings.local_media_path`` 保存，媒体根目录迁移后仍然有效。

Revision ID: f1a2b3c4d5e6
Revises: d5e6f7a8b9c0
Create Date: 2026-10-30 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "media_cleanup_tasks",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("path", sa.String(length=1000), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False, server_default="file"),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(length=1000), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_media_cleanup_status_next", "media_cleanup_tasks", ["status", "next_attempt_at"])
    op.create_index("ix_media_cleanup_user", "media_cleanup_tasks", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_media_cleanup_user", table_name="media_cleanup_tasks")
    op.drop_index("ix_media_cleanup_status_next", table_name="media_cleanup_tasks")
    op.drop_table("media_cleanup_tasks")
