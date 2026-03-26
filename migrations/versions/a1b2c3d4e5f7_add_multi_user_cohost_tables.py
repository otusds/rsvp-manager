"""add multi-user cohost tables

Revision ID: a1b2c3d4e5f7
Revises: f6a7b8c9d0e1
Create Date: 2026-03-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f7'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('event_cohost',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=10), nullable=False, server_default='cohost'),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['event.id']),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'user_id', name='uq_event_cohost'),
    )
    op.create_index('ix_event_cohost_event_id', 'event_cohost', ['event_id'])
    op.create_index('ix_event_cohost_user_id', 'event_cohost', ['user_id'])

    op.create_table('event_share_link',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('role', sa.String(length=10), nullable=False, server_default='cohost'),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.ForeignKeyConstraint(['event_id'], ['event.id']),
        sa.ForeignKeyConstraint(['created_by'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_event_share_link_token', 'event_share_link', ['token'], unique=True)
    op.create_index('ix_event_share_link_event_id', 'event_share_link', ['event_id'])

    with op.batch_alter_table('invitation', schema=None) as batch_op:
        batch_op.add_column(sa.Column('added_by', sa.Integer(), nullable=True))

    with op.batch_alter_table('activity_log', schema=None) as batch_op:
        batch_op.add_column(sa.Column('acting_user_id', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('activity_log', schema=None) as batch_op:
        batch_op.drop_column('acting_user_id')

    with op.batch_alter_table('invitation', schema=None) as batch_op:
        batch_op.drop_column('added_by')

    op.drop_table('event_share_link')
    op.drop_table('event_cohost')
