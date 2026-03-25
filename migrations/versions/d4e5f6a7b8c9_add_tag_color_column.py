"""add tag color column

Revision ID: d4e5f6a7b8c9
Revises: 2366c1339422
Create Date: 2026-03-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = '2366c1339422'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tag', schema=None) as batch_op:
        batch_op.add_column(sa.Column('color', sa.String(length=7), nullable=True))


def downgrade():
    with op.batch_alter_table('tag', schema=None) as batch_op:
        batch_op.drop_column('color')
