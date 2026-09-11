"""
ORM models for the multi-user SaaS layer (see PROJECT.md section 5).

Named with a *Record suffix on the loot-table entity specifically to avoid
colliding with app.schema.LootTable, the Pydantic model for the loot table
*config itself* (items/weights/pity) that's been the audited data shape
since the core-logic build. That Pydantic shape is stored here verbatim as
LootTableRecord.config_json -- the SQL table is still named `loot_tables`.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    plan: Mapped[str] = mapped_column(String, nullable=False, default="free")  # "free" | "studio" | "enterprise"
    # Ops/admin access -- bootstrapped via the TRUELOOT_ADMIN_EMAILS env var
    # (see app.auth.sync_admin_flag), not a self-serve signup option.
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    tables: Mapped[list["LootTableRecord"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class LootTableRecord(Base):
    __tablename__ = "loot_tables"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Full LootTable config (items/weights/pity), as JSON text -- matches
    # app.schema.LootTable field-for-field when parsed.
    config_json: Mapped[str] = mapped_column(Text, nullable=False)
    # advertised_rates duplicated at the top level per PROJECT.md's data
    # model, even though it's also embedded in config_json, so it can be
    # displayed/queried without deserializing the whole config.
    advertised_rates_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )

    owner: Mapped[User] = relationship(back_populates="tables")
    audit_runs: Mapped[list["AuditRun"]] = relationship(back_populates="loot_table", cascade="all, delete-orphan")


class AuditRun(Base):
    __tablename__ = "audit_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    loot_table_id: Mapped[str] = mapped_column(ForeignKey("loot_tables.id"), nullable=False, index=True)
    simulated_rates_json: Mapped[str] = mapped_column(Text, nullable=False)
    validation_flags_json: Mapped[str] = mapped_column(Text, nullable=False)
    compliance_flags_json: Mapped[str] = mapped_column(Text, nullable=False)
    pity_convergence_json: Mapped[str] = mapped_column(Text, nullable=True)
    pull_count: Mapped[int] = mapped_column(Integer, nullable=False)
    overall_status: Mapped[str] = mapped_column(String, nullable=False)  # "green" | "yellow" | "red" -- for the dashboard's status dot
    blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Which regional compliance rule pack (app.regions) this run was judged
    # against -- see db.py's init_db for how existing SQLite files pick up
    # this column without a migrations tool.
    region: Mapped[str] = mapped_column(String, nullable=False, default="global")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    loot_table: Mapped[LootTableRecord] = relationship(back_populates="audit_runs")
