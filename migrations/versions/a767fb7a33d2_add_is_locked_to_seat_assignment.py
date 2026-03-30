"""add is_locked to seat_assignment

Revision ID: a767fb7a33d2
Revises: 3ed8901df1ff
Create Date: 2026-03-30 14:04:03.252626

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a767fb7a33d2'
down_revision = '3ed8901df1ff'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('seat_assignment', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_locked', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade():
    with op.batch_alter_table('seat_assignment', schema=None) as batch_op:
        batch_op.drop_column('is_locked')
