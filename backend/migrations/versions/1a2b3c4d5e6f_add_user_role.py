"""add user role

Revision ID: 1a2b3c4d5e6f
Revises: 9b2c3d4e5f6a
Create Date: 2026-06-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a2b3c4d5e6f'
down_revision: Union[str, None] = '9b2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enum_exists(name: str) -> bool:
    """Check if a PostgreSQL enum type already exists."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT 1 FROM pg_type WHERE typname = :name"),
        {"name": name},
    )
    return result.fetchone() is not None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    from sqlalchemy import inspect
    inspector = inspect(op.get_bind())
    cols = [c['name'] for c in inspector.get_columns(table)]
    return column in cols


def upgrade() -> None:
    if not _enum_exists('roletype'):
        op.execute("CREATE TYPE roletype AS ENUM ('user', 'admin')")
    if not _column_exists('users', 'role'):
        op.add_column(
            'users',
            sa.Column(
                'role',
                sa.Enum('user', 'admin', name='roletype'),
                nullable=False,
                server_default='user',
            ),
        )


def downgrade() -> None:
    op.drop_column('users', 'role')
    op.execute("DROP TYPE roletype")
