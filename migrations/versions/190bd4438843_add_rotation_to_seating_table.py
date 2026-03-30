"""add rotation to seating_table

Revision ID: 190bd4438843
Revises: a767fb7a33d2
Create Date: 2026-03-30 17:32:17.445668

"""
from alembic import op
import sqlalchemy as sa

revision = '190bd4438843'
down_revision = 'a767fb7a33d2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('seating_table', schema=None) as batch_op:
        batch_op.add_column(sa.Column('rotation', sa.Integer(), server_default=sa.text('0'), nullable=False))


def downgrade():
    with op.batch_alter_table('seating_table', schema=None) as batch_op:
        batch_op.drop_column('rotation')
