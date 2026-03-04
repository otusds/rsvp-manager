"""Drop api_token column and add server_default to is_archived

Revision ID: a8b9c0d1e2f3
Revises: fbab87288589
Create Date: 2026-03-04 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a8b9c0d1e2f3'
down_revision = 'fbab87288589'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_api_token'))
        batch_op.drop_column('api_token')

    with op.batch_alter_table('guest', schema=None) as batch_op:
        batch_op.alter_column('is_archived',
                              existing_type=sa.Boolean(),
                              server_default=sa.text('0'),
                              nullable=False)


def downgrade():
    with op.batch_alter_table('guest', schema=None) as batch_op:
        batch_op.alter_column('is_archived',
                              existing_type=sa.Boolean(),
                              server_default=None,
                              nullable=True)

    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('api_token', sa.String(length=64), nullable=True))
        batch_op.create_index(batch_op.f('ix_user_api_token'), ['api_token'], unique=True)
