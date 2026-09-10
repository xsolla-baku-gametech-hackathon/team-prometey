"""
Data model for MeshDiff (hackathon scope).

Single-user, single-studio. No auth, no tenant enforcement — but the
schema keeps a stub `studio_id`/`uploader` column so it's not painful to
extend later. SQLite via SQLAlchemy.

Tables:
    Project      - a named grouping of asset versions
    AssetVersion - one uploaded .glb/.gltf file + its extracted data
    DiffResult   - a cached diff between two AssetVersions
"""

import datetime
import os
import uuid

from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Text,
    Boolean,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

Base = declarative_base()


def _uuid() -> str:
    return str(uuid.uuid4())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Stub for future multi-tenant support. Always "default" in v1.
    studio_id = Column(String, default="default", nullable=False)

    versions = relationship(
        "AssetVersion", back_populates="project", cascade="all, delete-orphan"
    )


class AssetVersion(Base):
    __tablename__ = "asset_versions"

    id = Column(String, primary_key=True, default=_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)

    filename = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)
    uploader = Column(String, default="local-user")  # stub for future auth

    # Path to the original uploaded .glb/.gltf on local disk. Nullable
    # because the row is created first (to get an id for the storage path),
    # then updated once the file is actually written to disk.
    original_file_path = Column(String, nullable=True)

    # Path to the extracted representation (JSON: materials + hierarchy)
    # produced by the extraction step. Geometry buffers/hashes live in a
    # separate binary file referenced from inside this JSON.
    extracted_json_path = Column(String, nullable=True)

    # Set once extraction has completed successfully.
    is_extracted = Column(Boolean, default=False)

    project = relationship("Project", back_populates="versions")


class DiffResult(Base):
    __tablename__ = "diff_results"

    id = Column(String, primary_key=True, default=_uuid)

    version_a_id = Column(String, ForeignKey("asset_versions.id"), nullable=False)
    version_b_id = Column(String, ForeignKey("asset_versions.id"), nullable=False)

    computed_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Full diff payload (materials/hierarchy/geometry summary) as JSON text.
    # Kept as a single JSON blob — simplest possible storage for a weekend
    # build; revisit only if we need to query into it.
    diff_json = Column(Text, nullable=False)

    # True if geometry comparison was index-aligned (vertex counts matched),
    # False if it fell back to nearest-neighbor matching.
    geometry_exact = Column(Boolean, nullable=False)

    version_a = relationship("AssetVersion", foreign_keys=[version_a_id])
    version_b = relationship("AssetVersion", foreign_keys=[version_b_id])


# --- Engine / session setup -------------------------------------------------

DB_PATH = os.environ.get("MESHDIFF_DB_PATH", "./meshdiff.db")
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    """Create tables if they don't exist. Call once on app startup."""
    Base.metadata.create_all(engine)


def get_session():
    """FastAPI dependency: yields a DB session, closes it after the request."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
