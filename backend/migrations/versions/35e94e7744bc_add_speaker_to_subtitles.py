"""add_speaker_to_subtitles

Revision ID: 35e94e7744bc
Revises: add_comments_and_comment_stats
Create Date: 2026-06-12 19:52:57.440339
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = '35e94e7744bc'
down_revision: Union[str, None] = 'add_comments_and_comment_stats'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add speaker column to subtitles table
    op.add_column('subtitles', sa.Column('speaker', sa.String(length=100), nullable=True))


def downgrade() -> None:
    # Remove speaker column from subtitles table
    op.drop_column('subtitles', 'speaker')
