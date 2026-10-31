"""A12：事件契约版本化与学习 flow 关联。

两件事：

1. **事件带版本**。前端与后端的上报/落库契约从此有显式版本号（v2 = 首次带
   flow 关联）。旧行回填为 1 而不是 NULL：``schema_version`` 的语义是「这行按哪
   一版契约理解」，不是「客户端有没有发版本」；历史数据确实按 v1 理解。
2. **学习 flow 关联**。``flow_id`` 是「一次学习流程」的服务端 id（听写会话、
   试卷会话、词汇轮次、练习提交），``source`` 是流程路径。客户端上报的意图
   （``flow_result``）与服务器落的学习结果（``LearningEvent``）用同一个
   flow_id 对齐，才能算丢失率与重复率（见 ``measurement_service``）。

``behavior_events`` 只加版本与 flow_id：它本来就是客户端原始事件表。

Revision ID: b7c8d9e0f1a2
Revises: f1a2b3c4d5e6
Create Date: 2026-10-30 00:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("learning_events", sa.Column("flow_id", sa.String(length=36), nullable=True))
    op.add_column("learning_events", sa.Column("source", sa.String(length=32), nullable=True))
    op.add_column(
        "learning_events",
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_learning_events_flow_id", "learning_events", ["flow_id"])

    op.add_column("behavior_events", sa.Column("flow_id", sa.String(length=36), nullable=True))
    op.add_column(
        "behavior_events",
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_behavior_events_flow_id", "behavior_events", ["flow_id"])


def downgrade() -> None:
    op.drop_index("ix_behavior_events_flow_id", table_name="behavior_events")
    op.drop_column("behavior_events", "schema_version")
    op.drop_column("behavior_events", "flow_id")

    op.drop_index("ix_learning_events_flow_id", table_name="learning_events")
    op.drop_column("learning_events", "schema_version")
    op.drop_column("learning_events", "source")
    op.drop_column("learning_events", "flow_id")
