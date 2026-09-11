"""
SQLite database setup (see PROJECT.md section 5).

A simple schema-file-and-create_all approach, no migrations tooling --
matches the build spec's "don't burn build time on migrations."
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = os.environ.get("LOOT_AUDITOR_DB_PATH", "./loot_auditor.db")
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


# Columns added to a table after its first deploy won't appear in an
# existing SQLite file just from create_all (it only creates missing
# tables, never alters existing ones) -- and this project deliberately
# has no migrations tool (see this module's original docstring). This is
# the minimal self-healing equivalent: for each such column, add it with
# its default if an existing file predates it.
_BACKFILL_COLUMNS = {
    "audit_runs": [("region", "VARCHAR NOT NULL DEFAULT 'global'")],
}


def _backfill_missing_columns() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("audit_runs"):
        return  # fresh database -- create_all above already has the full schema
    with engine.begin() as conn:
        for table_name, columns in _BACKFILL_COLUMNS.items():
            existing = {col["name"] for col in inspector.get_columns(table_name)}
            for column_name, ddl in columns:
                if column_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}"))


def init_db() -> None:
    Base.metadata.create_all(engine)
    _backfill_missing_columns()


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
