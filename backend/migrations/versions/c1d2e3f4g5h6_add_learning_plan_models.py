"""Add learning plan models (ADR-0012 Decision 3)

Four new tables for the AI learning plan feature:
  user_learning_profiles — one-to-one with users, aggregated learning profile
  learning_plans — daily learning plans with ordered items
  learning_plan_items — individual actionable items in a plan
  learning_events — structured semantic learning events (distinct from raw
      BehaviorEvent), feeds profile aggregation and recommendation system

Revision ID: c1d2e3f4g5h6
Revises: b7c8d9e0f1g2
Create Date: 2026-07-24 00:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "c1d2e3f4g5h6"
down_revision: str | None = "b7c8d9e0f1g2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. user_learning_profiles (one-to-one with users)
    op.create_table(
        "user_learning_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("estimated_level", sa.String(length=10), nullable=True),
        sa.Column("weekly_cycles_completed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("weekly_cycles_started", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("current_week_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_streak", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("longest_streak", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_active_date", sa.Date(), nullable=True),
        sa.Column("mastery_by_level", sa.JSON(), nullable=True),
        sa.Column("strengths", sa.JSON(), nullable=True),
        sa.Column("weaknesses", sa.JSON(), nullable=True),
        sa.Column("today_words_learned", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("today_minutes_spent", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("today_goal_met", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("today_date", sa.Date(), nullable=True),
        sa.Column("last_plan_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_learning_profile_user"),
    )
    op.create_index("ix_user_learning_profiles_user_id", "user_learning_profiles", ["user_id"], unique=True)

    # 2. learning_plans
    op.create_table(
        "learning_plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("generation_method", sa.String(length=10), server_default=sa.text("'rule'"), nullable=False),
        sa.Column("total_review_words", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("total_new_words", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("total_practice_items", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("estimated_minutes", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("completed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_learning_plans_user_id", "learning_plans", ["user_id"])
    op.create_index("ix_learning_plans_plan_date", "learning_plans", ["plan_date"])

    # 3. learning_plan_items
    op.create_table(
        "learning_plan_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=True),
        sa.Column("item_config", sa.JSON(), nullable=True),
        sa.Column("completed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["plan_id"], ["learning_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_learning_plan_items_plan_id", "learning_plan_items", ["plan_id"])
    op.create_index("ix_learning_plan_items_video_id", "learning_plan_items", ["video_id"])

    # 4. learning_events
    op.create_table(
        "learning_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("event_value", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=True),
        sa.Column("plan_id", sa.String(length=36), nullable=True),
        sa.Column("event_metadata", sa.JSON(), nullable=True),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_id"], ["learning_plans.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_learning_events_user_id", "learning_events", ["user_id"])
    op.create_index("ix_learning_events_user_date", "learning_events", ["user_id", "event_date"])
    op.create_index("ix_learning_events_user_type", "learning_events", ["user_id", "event_type"])


def downgrade() -> None:
    op.drop_table("learning_events")
    op.drop_table("learning_plan_items")
    op.drop_table("learning_plans")
    op.drop_table("user_learning_profiles")
