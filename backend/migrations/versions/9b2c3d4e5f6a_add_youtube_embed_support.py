"""add_youtube_embed_support

Revision ID: 9b2c3d4e5f6a
Revises: 8a1b2c3d4e5f
Create Date: 2026-05-31 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = '9b2c3d4e5f6a'
down_revision: Union[str, None] = '8a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enum_value_exists(type_name: str, value: str) -> bool:
    """Check if a PostgreSQL enum value already exists."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
            "WHERE t.typname = :type_name AND e.enumlabel = :value"
        ),
        {"type_name": type_name, "value": value},
    )
    return result.fetchone() is not None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    from sqlalchemy import inspect
    inspector = inspect(op.get_bind())
    cols = [c['name'] for c in inspector.get_columns(table)]
    return column in cols


def upgrade() -> None:
    if not _column_exists('videos', 'youtube_video_id'):
        op.add_column('videos', sa.Column('youtube_video_id', sa.String(20), nullable=True))
    if not _column_exists('videos', 'processing_mode'):
        op.add_column('videos', sa.Column('processing_mode', sa.String(20), nullable=True))
    if not _enum_value_exists('videostatus', 'ready_subtitles'):
        op.execute("ALTER TYPE videostatus ADD VALUE 'ready_subtitles'")


def downgrade() -> None:
    op.drop_column('videos', 'processing_mode')
    op.drop_column('videos', 'youtube_video_id')
