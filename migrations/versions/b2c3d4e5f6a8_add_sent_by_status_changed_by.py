"""add sent_by and status_changed_by to invitation

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-03-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a8'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('invitation', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sent_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('status_changed_by', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('invitation', schema=None) as batch_op:
        batch_op.drop_column('status_changed_by')
        batch_op.drop_column('sent_by')
