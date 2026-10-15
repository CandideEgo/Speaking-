"""drop the fossils of three cut features

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-10-16

Six tables outlived the features that owned them and stayed in
``Base.metadata`` ever since, so every ``create_all``-based test built them and
every autogenerate diff had to be read around them:

  video_comments, video_comment_stats  — YouTube comment quality analysis, cut
      with the community/UGC layer (ADR-0012). Nothing reads or writes them.
  subtitle_change_proposals, subtitle_mergeable_updates — the fork→standard
      "propose-back PR" flow (Phase 3e). Its whole service layer is gone; the
      models were the last remainder.
  learning_plans, learning_plan_items  — daily learning-plan task assignment,
      cut 2026-08-27. The endpoints already answer 410 Gone.

``learning_events.plan_id`` goes with them: its only writer was that cut flow,
and it is NULL in every row (0/129 on the dev DB). The FK and
``ix_learning_events_plan_id`` drop with the column.

Both cut features left their *live* halves behind on purpose:
``user_learning_profiles`` and ``learning_events`` still back the profile page,
the streak, and the recommendation system, and ``/plan/profile``,
``/plan/profile/refresh``, ``/plan/mastery-trend``, ``/plan/milestones`` stay.

Downgrade recreates the schema exactly as the creating revisions left it
(``80e681bd554d``, ``w4x5y6z7a8b9``, ``c1d2e3f4g5h6``, ``v1w2x3y4z5a6``) — the
short index names ``ix_scp_*`` / ``ix_smu_*`` included. It cannot restore rows;
the backstop for those is a ``pg_dump -t`` of the six tables taken before the
upgrade, kept outside the repo.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "c0d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # learning_events keeps its rows and its other reference columns; only the
    # dead pointer to learning_plans goes. Its FK and index go with the column.
    op.drop_index("ix_learning_events_plan_id", table_name="learning_events")
    op.drop_column("learning_events", "plan_id")

    # Children before parents: learning_plan_items.plan_id -> learning_plans.id,
    # subtitle_mergeable_updates.proposal_id -> subtitle_change_proposals.id.
    op.drop_table("learning_plan_items")
    op.drop_table("learning_plans")
    op.drop_table("subtitle_mergeable_updates")
    op.drop_table("subtitle_change_proposals")
    op.drop_table("video_comments")
    op.drop_table("video_comment_stats")


def downgrade() -> None:
    # Parents before children — mirror image of upgrade.
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

    op.add_column("learning_events", sa.Column("plan_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "learning_events_plan_id_fkey",
        "learning_events",
        "learning_plans",
        ["plan_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_learning_events_plan_id", "learning_events", ["plan_id"])

    op.create_table(
        "subtitle_change_proposals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "standard_video_id",
            sa.String(36),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_url", sa.String(2000), nullable=False),
        sa.Column(
            "submitted_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=True),
        sa.Column("changes", sa.JSON, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "reviewed_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_scp_standard_video_id", "subtitle_change_proposals", ["standard_video_id"])
    op.create_index("ix_scp_status", "subtitle_change_proposals", ["status"])
    op.create_index("ix_scp_submitted_by", "subtitle_change_proposals", ["submitted_by"])
    op.create_index("ix_scp_created_at", "subtitle_change_proposals", ["created_at"])

    op.create_table(
        "subtitle_mergeable_updates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "fork_video_id",
            sa.String(36),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "fork_subtitle_id",
            sa.String(36),
            sa.ForeignKey("subtitles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sentence_index", sa.Integer, nullable=False),
        sa.Column(
            "standard_revision_id",
            sa.String(36),
            sa.ForeignKey("subtitle_revisions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "proposal_id",
            sa.String(36),
            sa.ForeignKey("subtitle_change_proposals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("fork_video_id", "fork_subtitle_id", name="uq_mergeable_fork_subtitle"),
    )
    op.create_index("ix_smu_fork_video_id", "subtitle_mergeable_updates", ["fork_video_id"])

    op.create_table(
        "video_comment_stats",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("total_comments", sa.Integer(), nullable=False),
        sa.Column("total_likes", sa.Integer(), nullable=False),
        sa.Column("avg_comment_length", sa.Float(), nullable=False),
        sa.Column("learning_relevance_score", sa.Integer(), nullable=False),
        sa.Column("depth_score", sa.Integer(), nullable=False),
        sa.Column("engagement_score", sa.Integer(), nullable=False),
        sa.Column("overall_quality_score", sa.Integer(), nullable=False),
        sa.Column("keyword_stats", sa.JSON(), nullable=True),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("video_id"),
    )

    op.create_table(
        "video_comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("parent_id", sa.String(length=100), nullable=True),
        sa.Column("author_name", sa.String(length=255), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("like_count", sa.Integer(), nullable=False),
        sa.Column("reply_count", sa.Integer(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("video_id", "external_id", name="uq_video_comment_external"),
    )
    op.create_index(op.f("ix_video_comments_video_id"), "video_comments", ["video_id"], unique=False)
