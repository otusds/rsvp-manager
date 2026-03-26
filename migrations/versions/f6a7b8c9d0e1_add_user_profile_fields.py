"""add user profile fields

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('first_name', sa.String(length=100), nullable=True, server_default=''))
        batch_op.add_column(sa.Column('last_name', sa.String(length=100), nullable=True, server_default=''))
        batch_op.add_column(sa.Column('gender', sa.String(length=10), nullable=True, server_default=''))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('gender')
        batch_op.drop_column('last_name')
        batch_op.drop_column('first_name')
