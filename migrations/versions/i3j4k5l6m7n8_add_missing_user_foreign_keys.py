"""add the four user foreign keys the models declare but the schema never had

The models declare db.ForeignKey("user.id") on activity_log.acting_user_id and on
invitation.added_by / sent_by / status_changed_by, but the migrations that added
those columns created them as plain integers. So the database has never enforced
that they point at a real user: `flask db migrate` against a database at head
reports all four as missing.

Nothing breaks today, but deleting a user leaves those columns pointing at a row
that no longer exists and the database cannot object.

A constraint cannot be added while violating rows exist, and the production data
cannot be inspected ahead of time from here, so the migration checks for itself:
any value that does not match a real user is set to NULL first. All four columns
are already nullable, and a value pointing at a deleted user carries no
information anyway - NULL is what it should have been. Counts are logged so the
deploy output shows exactly what was touched.

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-09-16 12:00:00.000000

"""
import logging

from alembic import op
import sqlalchemy as sa

revision = 'i3j4k5l6m7n8'
down_revision = 'h2i3j4k5l6m7'
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

# (table, column, constraint name)
FOREIGN_KEYS = [
    ("activity_log", "acting_user_id", "fk_activity_log_acting_user_id_user"),
    ("invitation", "added_by", "fk_invitation_added_by_user"),
    ("invitation", "sent_by", "fk_invitation_sent_by_user"),
    ("invitation", "status_changed_by", "fk_invitation_status_changed_by_user"),
]


def _clear_orphans(conn, table, column):
    """NULL any value that does not point at an existing user.

    "user" is quoted because it is a reserved word in PostgreSQL.
    """
    orphans = conn.execute(sa.text(
        f'SELECT COUNT(*) FROM {table} '
        f'WHERE {column} IS NOT NULL '
        f'AND {column} NOT IN (SELECT id FROM "user")'
    )).scalar()
    if orphans:
        conn.execute(sa.text(
            f'UPDATE {table} SET {column} = NULL '
            f'WHERE {column} IS NOT NULL '
            f'AND {column} NOT IN (SELECT id FROM "user")'
        ))
        logger.info("%s.%s: cleared %s orphaned reference(s) before adding the foreign key",
                    table, column, orphans)
    else:
        logger.info("%s.%s: no orphaned references", table, column)
    return orphans


def upgrade():
    conn = op.get_bind()
    for table, column, _name in FOREIGN_KEYS:
        _clear_orphans(conn, table, column)

    # Grouped per table so SQLite (which rebuilds the table for each batch) does
    # the invitation table once rather than three times.
    for table in ("activity_log", "invitation"):
        with op.batch_alter_table(table) as batch_op:
            for t, column, name in FOREIGN_KEYS:
                if t == table:
                    batch_op.create_foreign_key(name, "user", [column], ["id"])


def downgrade():
    for table in ("invitation", "activity_log"):
        with op.batch_alter_table(table) as batch_op:
            for t, _column, name in FOREIGN_KEYS:
                if t == table:
                    batch_op.drop_constraint(name, type_="foreignkey")
