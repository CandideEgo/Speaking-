"""add unique constraint on learning_records (user_id, video_id)

Revision ID: a1b2c3d4e5f6
Revises: fa70252cc1d8
Create Date: 2026-06-14 12:00:00.000000

Deduplicates existing rows (keeps the most recent per user_id+video_id),
then adds UniqueConstraint('user_id', 'video_id').
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str | None] = 'd1e2f3a4b5c6'
branch_labels: Union[str | Sequence[str] | None] = None
depends_on: Union[str | Sequence[str] | None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: Deduplicate existing rows.
    # For each (user_id, video_id) pair that has duplicates, keep only the
    # row with the latest created_at and delete the rest.
    # Uses a self-join anti-pattern that works across SQLite / PostgreSQL.
    conn.execute(
        sa.text("""
            DELETE FROM learning_records
            WHERE id IN (
                SELECT lr1.id
                FROM learning_records lr1
                JOIN learning_records lr2
                    ON lr1.user_id = lr2.user_id
                    AND lr1.video_id = lr2.video_id
                    AND (
                        lr1.created_at < lr2.created_at
                        OR (
                            lr1.created_at = lr2.created_at
                            AND lr1.id < lr2.id
                        )
                    )
            )
        """)
    )

    # Step 2: Add the unique constraint
    op.create_unique_constraint(
        'uq_learning_record_user_video',
        'learning_records',
        ['user_id', 'video_id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_learning_record_user_video',
        'learning_records',
        type_='unique',
    )
