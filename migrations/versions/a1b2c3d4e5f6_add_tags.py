"""add tags

Revision ID: a1b2c3d4e5f6
Revises: 9b6ffe38308b
Create Date: 2026-02-23 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = '9b6ffe38308b'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('tag',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'name', name='uq_user_tag_name')
    )
    with op.batch_alter_table('tag', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tag_user_id'), ['user_id'], unique=False)

    op.create_table('guest_tags',
        sa.Column('guest_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['guest_id'], ['guest.id'], ),
        sa.ForeignKeyConstraint(['tag_id'], ['tag.id'], ),
        sa.PrimaryKeyConstraint('guest_id', 'tag_id')
    )


def downgrade():
    op.drop_table('guest_tags')
    with op.batch_alter_table('tag', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tag_user_id'))
    op.drop_table('tag')
