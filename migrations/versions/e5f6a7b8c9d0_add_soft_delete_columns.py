"""add soft delete columns

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('event', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deleted_at', sa.DateTime(), nullable=True))
        batch_op.create_index('ix_event_deleted_at', ['deleted_at'])

    with op.batch_alter_table('guest', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deleted_at', sa.DateTime(), nullable=True))
        batch_op.create_index('ix_guest_deleted_at', ['deleted_at'])

    with op.batch_alter_table('tag', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deleted_at', sa.DateTime(), nullable=True))
        batch_op.create_index('ix_tag_deleted_at', ['deleted_at'])


def downgrade():
    with op.batch_alter_table('tag', schema=None) as batch_op:
        batch_op.drop_index('ix_tag_deleted_at')
        batch_op.drop_column('deleted_at')

    with op.batch_alter_table('guest', schema=None) as batch_op:
        batch_op.drop_index('ix_guest_deleted_at')
        batch_op.drop_column('deleted_at')

    with op.batch_alter_table('event', schema=None) as batch_op:
        batch_op.drop_index('ix_event_deleted_at')
        batch_op.drop_column('deleted_at')
