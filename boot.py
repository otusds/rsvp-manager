"""Pre-deploy boot script: ensures migrations are in sync with the database."""
import subprocess
import sys

from app import app
from rsvp_manager.extensions import db


def main():
    with app.app_context():
        # Check if alembic_version table exists (i.e., migrations were ever run)
        result = db.session.execute(
            db.text("SELECT to_regclass('alembic_version')")
        ).scalar()

        if not result:
            # DB was created with db.create_all() before migrations existed.
            # Stamp to the revision matching the current production schema
            # (initial schema + api_token column), then upgrade will apply the rest.
            print("No alembic_version table found — stamping existing schema...")
            subprocess.run(
                [sys.executable, "-m", "flask", "db", "stamp", "3d7dfe580c58"],
                check=True,
            )

    # Now run any pending migrations
    subprocess.run(
        [sys.executable, "-m", "flask", "db", "upgrade"],
        check=True,
    )


if __name__ == "__main__":
    main()
