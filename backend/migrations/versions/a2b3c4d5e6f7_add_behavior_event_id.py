"""Add behavior_events.event_id for client-side event deduplication.

A02（FE-02 / BE 事件去重）：前端每次上报都带一个稳定的事件 id。服务端按它
去重，重试、keepalive 冲刷与普通分批同时送达时不会重复累计学习时长。

历史行没有 event_id（NULL）。PostgreSQL 与 SQLite 的唯一索引都允许多个 NULL，
因此不需要回填，也不会因为历史数据冲突。新版前端上线后的事件才有 id；
2026-10-29 之前的 watch_time 数据按 v1 口径（位置差）统计，与新口径不可比。

Revision ID: a2b3c4d5e6f7
Revises: c3d4e5f6a7b8
Create Date: 2026-10-29 00:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("behavior_events", sa.Column("event_id", sa.String(length=36), nullable=True))
    op.create_index("uq_behavior_events_event_id", "behavior_events", ["event_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_behavior_events_event_id", table_name="behavior_events")
    op.drop_column("behavior_events", "event_id")
