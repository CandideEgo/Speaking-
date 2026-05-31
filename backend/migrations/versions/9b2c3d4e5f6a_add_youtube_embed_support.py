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


def upgrade() -> None:
    op.add_column('videos', sa.Column('youtube_video_id', sa.String(20), nullable=True))
    op.add_column('videos', sa.Column('processing_mode', sa.String(20), nullable=True))
    op.execute("ALTER TYPE videostatus ADD VALUE 'ready_subtitles'")


def downgrade() -> None:
    op.drop_column('videos', 'processing_mode')
    op.drop_column('videos', 'youtube_video_id')
