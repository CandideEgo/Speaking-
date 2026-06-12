"""add_comments_and_comment_stats

Revision ID: add_comments_and_comment_stats
Revises: ab1c2d3e4f5a
Create Date: 2026-06-10 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers
revision: str = 'add_comments_and_comment_stats'
down_revision: Union[str, None] = 'ab1c2d3e4f5a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    inspector = inspect(op.get_bind())
    return name in inspector.get_table_names()


def _column_exists(table: str, column: str) -> bool:
    inspector = inspect(op.get_bind())
    cols = [c['name'] for c in inspector.get_columns(table)]
    return column in cols


def upgrade() -> None:
    # Create video_comments table
    if not _table_exists('video_comments'):
        op.create_table(
            'video_comments',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('video_id', sa.String(36), sa.ForeignKey('videos.id', ondelete='CASCADE'), nullable=False),
            sa.Column('external_id', sa.String(100), nullable=False),
            sa.Column('parent_id', sa.String(100), nullable=True),
            sa.Column('author_name', sa.String(255), nullable=True),
            sa.Column('text', sa.Text(), nullable=False),
            sa.Column('like_count', sa.Integer(), default=0),
            sa.Column('reply_count', sa.Integer(), default=0),
            sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint('video_id', 'external_id', name='uq_video_comment_external'),
        )
        op.create_index('idx_video_comments_video_id', 'video_comments', ['video_id'])
        op.create_index('idx_video_comments_external_id', 'video_comments', ['external_id'])

    # Create video_comment_stats table
    if not _table_exists('video_comment_stats'):
        op.create_table(
            'video_comment_stats',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('video_id', sa.String(36), sa.ForeignKey('videos.id', ondelete='CASCADE'), nullable=False, unique=True),
            sa.Column('total_comments', sa.Integer(), default=0),
            sa.Column('total_likes', sa.Integer(), default=0),
            sa.Column('avg_comment_length', sa.Float(), default=0),
            sa.Column('learning_relevance_score', sa.Integer(), default=0),
            sa.Column('depth_score', sa.Integer(), default=0),
            sa.Column('engagement_score', sa.Integer(), default=0),
            sa.Column('overall_quality_score', sa.Integer(), default=0),
            sa.Column('keyword_stats', sa.JSON(), nullable=True),
            sa.Column('analyzed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )

    # Add optional columns to videos table for quick querying
    if not _column_exists('videos', 'comment_quality_score'):
        op.add_column('videos', sa.Column('comment_quality_score', sa.Integer(), nullable=True))
    if not _column_exists('videos', 'comment_count'):
        op.add_column('videos', sa.Column('comment_count', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('videos', 'comment_count')
    op.drop_column('videos', 'comment_quality_score')
    op.drop_table('video_comment_stats')
    op.drop_table('video_comments')
