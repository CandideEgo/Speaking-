"""add ondelete cascade to foreign keys

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-07-01 00:03:00.000000

Adds ondelete behaviour to foreign keys that previously lacked it,
preventing orphaned rows when parent records are deleted:

- Post.video_id → CASCADE (video deleted → post deleted)
- UserComment.parent_id → CASCADE (parent comment deleted → replies deleted)
- CommentReport.comment_id → CASCADE (comment deleted → reports deleted)
- SpeakingAttempt.subtitle_id → SET NULL (subtitle deleted → attempt kept)
- LearningRecord.video_id → CASCADE (video deleted → records deleted)
- Vocabulary.video_id → CASCADE (video deleted → words deleted)

Note: video_service.delete_video() already handles most of these with
explicit bulk DELETE statements for backwards compatibility with SQLite
tests. The DB-level CASCADE is a safety net for direct ORM deletes and
future code paths.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "r7s8t9u0v1w2"
down_revision: str | None = "q6r7s8t9u0v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Post.video_id: add ondelete CASCADE
    op.drop_constraint("posts_video_id_fkey", "posts", type_="foreignkey")
    op.create_foreign_key("posts_video_id_fkey", "posts", "videos", ["video_id"], ["id"], ondelete="CASCADE")

    # UserComment.parent_id: add ondelete CASCADE
    op.drop_constraint("user_comments_parent_id_fkey", "user_comments", type_="foreignkey")
    op.create_foreign_key(
        "user_comments_parent_id_fkey",
        "user_comments",
        "user_comments",
        ["parent_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # CommentReport.comment_id: add ondelete CASCADE
    op.drop_constraint("comment_reports_comment_id_fkey", "comment_reports", type_="foreignkey")
    op.create_foreign_key(
        "comment_reports_comment_id_fkey",
        "comment_reports",
        "user_comments",
        ["comment_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # SpeakingAttempt.subtitle_id: add ondelete SET NULL
    op.drop_constraint("speaking_attempts_subtitle_id_fkey", "speaking_attempts", type_="foreignkey")
    op.create_foreign_key(
        "speaking_attempts_subtitle_id_fkey",
        "speaking_attempts",
        "subtitles",
        ["subtitle_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # LearningRecord.video_id: add ondelete CASCADE
    op.drop_constraint("learning_records_video_id_fkey", "learning_records", type_="foreignkey")
    op.create_foreign_key(
        "learning_records_video_id_fkey",
        "learning_records",
        "videos",
        ["video_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Vocabulary.video_id: add ondelete CASCADE
    op.drop_constraint("vocabulary_video_id_fkey", "vocabulary", type_="foreignkey")
    op.create_foreign_key(
        "vocabulary_video_id_fkey",
        "vocabulary",
        "videos",
        ["video_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    # Revert to no ondelete (the original state)
    op.drop_constraint("vocabulary_video_id_fkey", "vocabulary", type_="foreignkey")
    op.create_foreign_key("vocabulary_video_id_fkey", "vocabulary", "videos", ["video_id"], ["id"])

    op.drop_constraint("learning_records_video_id_fkey", "learning_records", type_="foreignkey")
    op.create_foreign_key("learning_records_video_id_fkey", "learning_records", "videos", ["video_id"], ["id"])

    op.drop_constraint("speaking_attempts_subtitle_id_fkey", "speaking_attempts", type_="foreignkey")
    op.create_foreign_key(
        "speaking_attempts_subtitle_id_fkey", "speaking_attempts", "subtitles", ["subtitle_id"], ["id"]
    )

    op.drop_constraint("comment_reports_comment_id_fkey", "comment_reports", type_="foreignkey")
    op.create_foreign_key("comment_reports_comment_id_fkey", "comment_reports", "user_comments", ["comment_id"], ["id"])

    op.drop_constraint("user_comments_parent_id_fkey", "user_comments", type_="foreignkey")
    op.create_foreign_key("user_comments_parent_id_fkey", "user_comments", "user_comments", ["parent_id"], ["id"])

    op.drop_constraint("posts_video_id_fkey", "posts", type_="foreignkey")
    op.create_foreign_key("posts_video_id_fkey", "posts", "videos", ["video_id"], ["id"])
