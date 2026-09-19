"""Add videos.storage_mode (内容三态: local / proxy / offline).

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-09-19 00:00:00.000000

产品需求 §5.1 引入内容存储三态：

* ``local``   本地精品 —— 下载转码自托管（现状，默认值）
* ``proxy``   代理播放 —— 不下载媒体（§5.4 优先级 3「远期/占位」，本期不实现）
* ``offline`` 已下线   —— 删除媒体文件释放空间、从首页/推荐/排行隐藏，
                但 video 行保留 dormant，学习记录与词表不断链（§5.3）

回填为 ``local``（存量视频全部是本地自托管）。用 server_default 让既有行一次
性填值，避免应用侧读到 NULL。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "i4j5k6l7m8n9"
down_revision: str | None = "h3i4j5k6l7m8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("storage_mode", sa.String(length=10), nullable=False, server_default="local"),
    )
    op.create_index("ix_videos_storage_mode", "videos", ["storage_mode"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_videos_storage_mode", table_name="videos")
    op.drop_column("videos", "storage_mode")
