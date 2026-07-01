"""add missing indexes for frequently queried columns

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-07-01 00:02:00.000000

Adds indexes on columns that are queried in every feed/list/delete
operation but currently force a full table scan:

- ix_user_comments_parent_id   — reply-tree queries
- ix_posts_video_id             — delete_video cleanup, video_share posts
- ix_comment_reports_status     — admin pending-report count
- ix_learning_records_video_id  — video detail learning data
- ix_vocab_video_id             — delete_video cleanup, learning record join
- ix_daily_activities_date      — admin stats by date range
- ix_videos_homepage_status     — browse feed composite
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "q6r7s8t9u0v1"
down_revision: str | None = "p5q6r7s8t9u0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Community: reply-tree queries (get_post_comments)
    op.create_index("ix_user_comments_parent_id", "user_comments", ["parent_id"])

    # Community: video_share posts + delete_video cleanup
    op.create_index("ix_posts_video_id", "posts", ["video_id"])

    # Community: admin report queue (status = 'pending')
    op.create_index("ix_comment_reports_status", "comment_reports", ["status"])

    # Learning: video-scoped queries (watch page, speaking practice)
    op.create_index("ix_learning_records_video_id", "learning_records", ["video_id"])

    # Vocabulary: video-scoped cleanup + learning record joins
    op.create_index("ix_vocab_video_id", "vocabulary", ["video_id"])

    # Activity: date-range queries (admin stats, calendar heatmap)
    op.create_index("ix_daily_activities_date", "daily_activities", ["date"])

    # Videos: browse feed + homepage composite index
    op.create_index(
        "ix_videos_homepage_status",
        "videos",
        ["show_on_homepage", "is_published", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_videos_homepage_status", table_name="videos")
    op.drop_index("ix_daily_activities_date", table_name="daily_activities")
    op.drop_index("ix_vocab_video_id", table_name="vocabulary")
    op.drop_index("ix_learning_records_video_id", table_name="learning_records")
    op.drop_index("ix_comment_reports_status", table_name="comment_reports")
    op.drop_index("ix_posts_video_id", table_name="posts")
    op.drop_index("ix_user_comments_parent_id", table_name="user_comments")
