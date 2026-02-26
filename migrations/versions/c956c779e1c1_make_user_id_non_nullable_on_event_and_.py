"""make user_id non-nullable on event and guest

Revision ID: c956c779e1c1
Revises: e5f453498768
Create Date: 2026-02-26 15:16:18.627454

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c956c779e1c1'
down_revision = 'e5f453498768'
branch_labels = None
depends_on = None


def upgrade():
    # Clean up any orphaned rows with NULL user_id before adding constraint
    op.execute("DELETE FROM invitation WHERE event_id IN (SELECT id FROM event WHERE user_id IS NULL)")
    op.execute("DELETE FROM invitation WHERE guest_id IN (SELECT id FROM guest WHERE user_id IS NULL)")
    op.execute("DELETE FROM event WHERE user_id IS NULL")
    op.execute("DELETE FROM guest WHERE user_id IS NULL")

    with op.batch_alter_table('event', schema=None) as batch_op:
        batch_op.alter_column('user_id',
               existing_type=sa.INTEGER(),
               nullable=False)

    with op.batch_alter_table('guest', schema=None) as batch_op:
        batch_op.alter_column('user_id',
               existing_type=sa.INTEGER(),
               nullable=False)


def downgrade():
    with op.batch_alter_table('guest', schema=None) as batch_op:
        batch_op.alter_column('user_id',
               existing_type=sa.INTEGER(),
               nullable=True)

    with op.batch_alter_table('event', schema=None) as batch_op:
        batch_op.alter_column('user_id',
               existing_type=sa.INTEGER(),
               nullable=True)
