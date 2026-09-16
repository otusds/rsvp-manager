"""Guard against the models and the migrations drifting apart.

The audit found four foreign keys that the models declared but no migration ever
created, so the production database had never enforced them. Nothing failed
loudly; it only showed up when running `flask db migrate` and noticing the
"empty" migration was not empty.

This test runs that same comparison in CI: build a database from the migrations,
compare it against the models, and fail if anything differs.
"""
import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic import command
from alembic.config import Config as AlembicConfig
from pathlib import Path

from rsvp_manager.extensions import db

ROOT = Path(__file__).resolve().parent.parent

# Alembic reports these for SQLite regardless of the models; they are artefacts of
# how SQLite reflects types and defaults, not real drift.
IGNORED_KINDS = {"modify_default", "modify_nullable", "modify_type"}


def _alembic_config(url):
    cfg = AlembicConfig(str(ROOT / "migrations" / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def test_migrations_produce_the_schema_the_models_describe(tmp_path):
    from rsvp_manager import create_app
    from rsvp_manager.config import TestConfig

    db_path = tmp_path / "migrated.db"
    url = f"sqlite:///{db_path}"

    class MigratedConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = url

    app = create_app(MigratedConfig)
    with app.app_context():
        command.upgrade(_alembic_config(url), "head")

        with db.engine.connect() as conn:
            ctx = MigrationContext.configure(conn, opts={"compare_type": False})
            diff = [d for d in compare_metadata(ctx, db.metadata)
                    if not (isinstance(d, tuple) and d and d[0] in IGNORED_KINDS)]

    assert not diff, (
        "the models and the migrations disagree; run `flask db migrate` and "
        "commit the result, or fix the model:\n  "
        + "\n  ".join(str(d) for d in diff)
    )


def test_single_migration_head():
    """Two heads mean `flask db upgrade` picks one and silently skips the other."""
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(_alembic_config("sqlite://"))
    heads = script.get_heads()
    assert len(heads) == 1, f"expected exactly one migration head, found {heads}"
