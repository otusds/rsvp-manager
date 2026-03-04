"""Drop channel column from invitation table

Revision ID: b1c2d3e4f5a6
Revises: a8b9c0d1e2f3
Create Date: 2026-03-04 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c2d3e4f5a6'
down_revision = 'a8b9c0d1e2f3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('invitation', schema=None) as batch_op:
        batch_op.drop_column('channel')


def downgrade():
    with op.batch_alter_table('invitation', schema=None) as batch_op:
        batch_op.add_column(sa.Column('channel', sa.String(length=50), nullable=True, server_default=''))
