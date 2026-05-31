"""make_video_user_id_nullable

Revision ID: 8a1b2c3d4e5f
Revises: 6d117491297b
Create Date: 2026-05-31 10:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = '8a1b2c3d4e5f'
down_revision: Union[str, None] = '6d117491297b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('videos', 'user_id',
                    existing_type=sa.String(36),
                    nullable=True)


def downgrade() -> None:
    op.alter_column('videos', 'user_id',
                    existing_type=sa.String(36),
                    nullable=False)
