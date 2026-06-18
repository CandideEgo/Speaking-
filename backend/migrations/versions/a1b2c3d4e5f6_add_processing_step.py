"""add processing_step column to videos

Revision ID: d1e2f3a4b5c6
Revises: 35e94e7744bc
Create Date: 2026-06-14

"""
from alembic import op
import sqlalchemy as sa


revision = "d1e2f3a4b5c6"
down_revision = "35e94e7744bc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("processing_step", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("videos", "processing_step")
