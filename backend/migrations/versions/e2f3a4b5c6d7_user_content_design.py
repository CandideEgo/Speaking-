"""User interests, subscriptions, sentence favorites and non-video vocab sets.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""

import sqlalchemy as sa
from alembic import op

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user_preferences", sa.Column("interest_categories", sa.JSON(), nullable=True))
    op.add_column("vocab_sets", sa.Column("source_type", sa.String(10), server_default="video", nullable=False))
    op.add_column("vocab_sets", sa.Column("name", sa.String(100), nullable=True))
    with op.batch_alter_table("vocab_sets") as batch:
        batch.alter_column("video_id", existing_type=sa.String(36), nullable=True)
    for table, target, column, constraint in (
        ("channel_subscriptions", "channels", "channel_id", "uq_channel_subscriptions_user_channel"),
        ("sentence_favorites", "subtitles", "subtitle_id", "uq_sentence_favorites_user_subtitle"),
    ):
        op.create_table(
            table,
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column(column, sa.String(36), sa.ForeignKey(f"{target}.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", column, name=constraint),
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    # Removing new-source sets only removes their memberships, never Vocabulary.
    op.execute("DELETE FROM vocab_set_words WHERE set_id IN (SELECT id FROM vocab_sets WHERE video_id IS NULL)")
    op.execute("DELETE FROM vocab_sets WHERE video_id IS NULL")
    op.drop_table("sentence_favorites")
    op.drop_table("channel_subscriptions")
    with op.batch_alter_table("vocab_sets") as batch:
        batch.alter_column("video_id", existing_type=sa.String(36), nullable=False)
        batch.drop_column("name")
        batch.drop_column("source_type")
    op.drop_column("user_preferences", "interest_categories")
