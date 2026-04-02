"""add pending email fields for email change

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-04-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'h2i3j4k5l6m7'
down_revision = 'g1h2i3j4k5l6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('pending_email', sa.String(length=200), nullable=True))
    op.add_column('user', sa.Column('pending_email_token', sa.String(length=64), nullable=True))
    op.add_column('user', sa.Column('pending_email_sent_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('user', 'pending_email_sent_at')
    op.drop_column('user', 'pending_email_token')
    op.drop_column('user', 'pending_email')
