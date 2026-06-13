"""add orders table

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
Create Date: 2026-06-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b3c4d5e6f7a'
down_revision: Union[str, None] = '1a2b3c4d5e6f'
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


def _table_exists(name: str) -> bool:
    """Check if a table already exists."""
    from sqlalchemy import inspect
    inspector = inspect(op.get_bind())
    return name in inspector.get_table_names()


def _index_exists(name: str) -> bool:
    """Check if an index already exists."""
    from sqlalchemy import inspect
    inspector = inspect(op.get_bind())
    return name in inspector.get_indexes('orders') if _table_exists('orders') else False


def upgrade() -> None:
    if not _enum_exists('orderstatus'):
        op.execute("CREATE TYPE orderstatus AS ENUM ('pending', 'paid', 'expired', 'cancelled')")

    if not _table_exists('orders'):
        op.create_table(
            'orders',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('user_id', sa.String(length=36), nullable=False),
            sa.Column('order_number', sa.String(length=64), nullable=False),
            sa.Column('plan', sa.String(length=20), nullable=False),
            sa.Column('amount', sa.Integer(), nullable=False),
            sa.Column(
                'status',
                sa.Enum('pending', 'paid', 'expired', 'cancelled', name='orderstatus'),
                nullable=False,
            ),
            sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_orders_order_number'), 'orders', ['order_number'], unique=True)
        op.create_index(op.f('ix_orders_user_id'), 'orders', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_orders_user_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_order_number'), table_name='orders')
    op.drop_table('orders')
    op.execute("DROP TYPE IF EXISTS orderstatus")
