"""新增 pipeline_dispatches 派发 outbox（A05/BE-01）。

管线原本「先 commit 状态、再 ``.delay()`` 入队」，两步之间掉线就会永久丢一步：
回调可以重试但会被当成重复回调直接 acknowledged，看门狗只会把视频标 error。
这张表把「这个视频必须跑这个任务」的意图写进**同一个事务**，提交后做一次
尽力而为的立即派发，剩下的由 beat ``dispatch_pipeline_tasks`` 每分钟补发。
至少一次投递是安全的：两个管线任务都在处理锁与已完成步骤集下幂等。

- 唯一约束 ``(video_id, task_name)``：重复回调 / 续跑 / 补发都命中同一行，
  不会把同一个任务排两遍；重新入队会把该行重置为 pending。
- 只追加判定结果：``dispatched`` 表示已交给 broker（不代表任务跑完，任务是否
  完成仍看视频状态），``abandoned`` 表示视频已经离开该任务适用的状态。
- 表由 beat 按 ``PIPELINE_DISPATCH_RETENTION_HOURS`` 清理已落定行。

本迁移只建空表，不改历史数据：旧视频没有待派发意图，状态机维持原样。

Revision ID: d5e6f7a8b9c0
Revises: b3c4d5e6f7a8
Create Date: 2026-10-29 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pipeline_dispatches",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "video_id",
            sa.String(length=36),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("task_name", sa.String(length=200), nullable=False),
        sa.Column("queue", sa.String(length=100), nullable=True),
        sa.Column("args", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(length=1000), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("video_id", "task_name", name="uq_pipeline_dispatches_video_task"),
    )
    op.create_index("ix_pipeline_dispatches_video_id", "pipeline_dispatches", ["video_id"])
    op.create_index(
        "ix_pipeline_dispatches_status_next",
        "pipeline_dispatches",
        ["status", "next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_pipeline_dispatches_status_next", table_name="pipeline_dispatches")
    op.drop_index("ix_pipeline_dispatches_video_id", table_name="pipeline_dispatches")
    op.drop_table("pipeline_dispatches")
