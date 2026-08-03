"""add learning_events video_id/plan_id indexes

Revision ID: v1w2x3y4z5a6
Revises: u3v4w5x6y7z8
Create Date: 2026-08-04

The optional ``video_id`` / ``plan_id`` reference columns on
``learning_events`` were never indexed, so per-video / per-plan event
aggregations (recommendation + learning profile pipelines) had to scan
the whole table. Add the missing single-column indexes.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "v1w2x3y4z5a6"
down_revision = "u3v4w5x6y7z8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_learning_events_video_id", "learning_events", ["video_id"])
    op.create_index("ix_learning_events_plan_id", "learning_events", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_learning_events_plan_id", table_name="learning_events")
    op.drop_index("ix_learning_events_video_id", table_name="learning_events")
