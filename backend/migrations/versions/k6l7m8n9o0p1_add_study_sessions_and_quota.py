"""Add study_sessions / study_session_items, vocabulary wrong-count columns and the daily quota (DEC-053).

词汇训练从「进度只活在 React state」改为落库 (设计方案 §3.2 §3.3 §5.5)：

- ``study_sessions`` — 一轮训练。``kind=daily`` 是当日配额那一轮，``kind=extra``
  是加练轮（同配额、计入今日累计但不计入今日目标）。``local_date`` 存用户本地日期，
  与 ``learning_events.event_date`` 同一日界。
- ``study_session_items`` — 每词一行，反复作答是 UPDATE（``correct_streak`` /
  ``wrong_in_round`` / ``status``），不追加新行，存储因此有上界。
- ``vocabulary.wrong_count`` / ``last_wrong_at`` — 累计答错次数与最后一次答错时间；
  S6 的复习间隔算法按这两列分档，不再用 SM-2 的 ``ease_factor`` 乘法。
- ``user_learning_profiles.daily_new_target``（默认 10）/ ``daily_review_target``
  （默认 20）— 每日训练配额。全局一个设置，不是每个视频一个。

存量行由 server_default 补齐：``wrong_count`` 0（没有历史答错记录可言）、
``daily_new_target`` 10 / ``daily_review_target`` 20（与旧硬编码 15/20 的新词口径
对齐设计定稿的默认 10）。列保留 server_default，应用层不写时也有值。

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-09-25 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "k6l7m8n9o0p1"
down_revision: str | None = "j5k6l7m8n9o0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "study_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False, server_default="daily"),
        sa.Column("target_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("done_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("correct_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(12), nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_study_sessions_user_id", "study_sessions", ["user_id"], unique=False)
    op.create_index("ix_study_sessions_status", "study_sessions", ["status"], unique=False)
    op.create_index(
        "ix_study_sessions_user_status",
        "study_sessions",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_study_sessions_user_date",
        "study_sessions",
        ["user_id", "local_date"],
        unique=False,
    )

    op.create_table(
        "study_session_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("study_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vocabulary_id",
            sa.String(36),
            sa.ForeignKey("vocabulary.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("correct_streak", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("wrong_in_round", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(12), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "vocabulary_id", name="uq_study_session_item"),
    )
    op.create_index(
        "ix_study_session_items_session_id",
        "study_session_items",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        "ix_study_session_items_vocabulary",
        "study_session_items",
        ["vocabulary_id"],
        unique=False,
    )

    op.add_column("vocabulary", sa.Column("wrong_count", sa.Integer(), nullable=False, server_default=sa.text("0")))
    op.add_column("vocabulary", sa.Column("last_wrong_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column(
        "user_learning_profiles",
        sa.Column("daily_new_target", sa.Integer(), nullable=False, server_default=sa.text("10")),
    )
    op.add_column(
        "user_learning_profiles",
        sa.Column("daily_review_target", sa.Integer(), nullable=False, server_default=sa.text("20")),
    )


def downgrade() -> None:
    op.drop_column("user_learning_profiles", "daily_review_target")
    op.drop_column("user_learning_profiles", "daily_new_target")

    op.drop_column("vocabulary", "last_wrong_at")
    op.drop_column("vocabulary", "wrong_count")

    op.drop_index("ix_study_session_items_vocabulary", table_name="study_session_items")
    op.drop_index("ix_study_session_items_session_id", table_name="study_session_items")
    op.drop_table("study_session_items")

    op.drop_index("ix_study_sessions_user_date", table_name="study_sessions")
    op.drop_index("ix_study_sessions_user_status", table_name="study_sessions")
    op.drop_index("ix_study_sessions_status", table_name="study_sessions")
    op.drop_index("ix_study_sessions_user_id", table_name="study_sessions")
    op.drop_table("study_sessions")
