"""add unique constraint on invitation(event_id, guest_id)

Revision ID: g1h2i3j4k5l6
Revises: 190bd4438843
Create Date: 2026-04-01 00:00:00.000000

"""
from alembic import op

revision = 'g1h2i3j4k5l6'
down_revision = '190bd4438843'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('invitation') as batch_op:
        batch_op.create_unique_constraint('uq_invitation_event_guest', ['event_id', 'guest_id'])


def downgrade():
    with op.batch_alter_table('invitation') as batch_op:
        batch_op.drop_constraint('uq_invitation_event_guest', type_='unique')
