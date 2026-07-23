"""Drop the 6 social-community tables (ADR-0012)

ADR-0012 cuts social community UGC and pivots to AI learning plans. These 6
tables - posts, post_likes, user_comments, comment_likes, comment_reports,
follows - plus all their API/service/frontend are removed. VideoLike (watch-page
like button, feeds recommendation like_count/is_featured) was already extracted
to models/engagement.py in 0c67c6e and is NOT touched here.

Drop order is dependency-aware (dependents first) so plain DROP TABLE succeeds
without CASCADE. A full pg_dump backup was taken before running this.

Revision ID: b7c8d9e0f1g2
Revises: z9y8x7w6v5u4
Create Date: 2026-07-24 00:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b7c8d9e0f1g2"
down_revision: str | None = "z9y8x7w6v5u4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Dependents first: comment_likes/comment_reports depend on user_comments;
    # post_likes depends on posts; user_comments depends on posts (and self).
    op.drop_table("comment_likes")
    op.drop_table("comment_reports")
    op.drop_table("post_likes")
    op.drop_table("follows")
    op.drop_table("user_comments")
    op.drop_table("posts")


def downgrade() -> None:
    # Recreate schema only (data was lost on drop; restore from the pg_dump
    # backup taken before upgrade if rows are needed). Parents first.
    op.create_table(
        "posts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("post_type", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("media_url", sa.String(length=2000), nullable=True),
        sa.Column("video_id", sa.String(length=36), nullable=True),
        sa.Column("speaking_attempt_id", sa.String(length=36), nullable=True),
        sa.Column("vocabulary_id", sa.String(length=36), nullable=True),
        sa.Column("like_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("comment_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["speaking_attempt_id"], ["speaking_attempts.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vocabulary_id"], ["vocabulary.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_posts_user_id", "posts", ["user_id"])
    op.create_index("ix_posts_video_id", "posts", ["video_id"])

    op.create_table(
        "post_likes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("post_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_post_like"),
    )
    op.create_index("ix_post_likes_post_id", "post_likes", ["post_id"])
    op.create_index("ix_post_likes_user_id", "post_likes", ["user_id"])

    op.create_table(
        "follows",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("follower_id", sa.String(length=36), nullable=False),
        sa.Column("followee_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["follower_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["followee_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("follower_id", "followee_id", name="uq_follow"),
    )
    op.create_index("ix_follows_follower_id", "follows", ["follower_id"])
    op.create_index("ix_follows_followee_id", "follows", ["followee_id"])

    op.create_table(
        "user_comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("post_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("like_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_reported", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["user_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_comments_parent_id", "user_comments", ["parent_id"])
    op.create_index("ix_user_comments_post_id", "user_comments", ["post_id"])
    op.create_index("ix_user_comments_user_id", "user_comments", ["user_id"])

    op.create_table(
        "comment_likes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("comment_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["user_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("comment_id", "user_id", name="uq_comment_like"),
    )
    op.create_index("ix_comment_likes_comment_id", "comment_likes", ["comment_id"])
    op.create_index("ix_comment_likes_user_id", "comment_likes", ["user_id"])

    op.create_table(
        "comment_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("comment_id", sa.String(length=36), nullable=False),
        sa.Column("reporter_id", sa.String(length=36), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["user_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reporter_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("comment_id", "reporter_id", name="uq_comment_report_comment_reporter"),
    )
    op.create_index("ix_comment_reports_comment_id", "comment_reports", ["comment_id"])
    op.create_index("ix_comment_reports_status", "comment_reports", ["status"])
