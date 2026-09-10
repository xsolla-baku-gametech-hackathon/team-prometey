"""
MeshDiff API (hackathon scope: single user, no auth, synchronous processing).

Endpoints:
    POST   /projects                        create a project
    GET    /projects                        list projects
    GET    /projects/{project_id}            project detail + its versions
    POST   /projects/{project_id}/versions   upload a .glb/.gltf, extract it
    GET    /versions/{version_id}            version detail
    POST   /diffs                            compute (or fetch cached) diff between two versions
    GET    /diffs/{diff_id}                  retrieve a previously computed diff
    GET    /projects/{project_id}/diffs      list past diffs for a project

Extraction and diffing run synchronously in the request. Per the scope doc,
that's fine for hackathon-sized assets (<100k vertices, a few seconds) --
no background task queue for v1.
"""

import json
import os
import shutil

import sqlalchemy
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import storage
from app.diff import diff_assets
from app.extraction import extract_asset, ExtractionError
from app.models import AssetVersion, DiffResult, Project, get_session, init_db

app = FastAPI(title="MeshDiff API")

# Wide-open CORS for the hackathon: frontend runs on a different port/origin
# during local dev and this app has no auth/session cookies to protect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".glb", ".gltf"}


@app.on_event("startup")
def on_startup():
    init_db()
    os.makedirs(storage.STORAGE_ROOT, exist_ok=True)


# --- Projects ------------------------------------------------------------------

@app.post("/projects")
def create_project(name: str = Form(...), db: Session = Depends(get_session)):
    if not name.strip():
        raise HTTPException(400, "Project name cannot be empty.")
    project = Project(name=name.strip())
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_out(project)


@app.get("/projects")
def list_projects(db: Session = Depends(get_session)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_project_out(p) for p in projects]


@app.get("/projects/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_session)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, f"Project '{project_id}' not found.")
    return {
        **_project_out(project),
        "versions": [_version_out(v) for v in project.versions],
    }


# --- Asset versions --------------------------------------------------------------

@app.post("/projects/{project_id}/versions")
async def upload_version(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, f"Project '{project_id}' not found.")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Unsupported file type '{ext or '(none)'}'. "
            f"MeshDiff only supports: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    version = AssetVersion(project_id=project_id, filename=file.filename)
    db.add(version)
    db.commit()
    db.refresh(version)

    storage.ensure_version_dirs(project_id, version.id)
    saved_path = storage.original_file_path(project_id, version.id, file.filename)

    with open(saved_path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    version.original_file_path = saved_path

    try:
        meta_path = extract_asset(saved_path, storage.extracted_dir(project_id, version.id))
    except ExtractionError as exc:
        # Roll back: don't leave a half-broken version row/files behind.
        db.delete(version)
        db.commit()
        shutil.rmtree(storage.version_dir(project_id, version.id), ignore_errors=True)
        raise HTTPException(422, str(exc)) from exc

    version.extracted_json_path = meta_path
    version.is_extracted = True
    db.commit()
    db.refresh(version)

    return _version_out(version)


@app.get("/versions/{version_id}")
def get_version(version_id: str, db: Session = Depends(get_session)):
    version = db.get(AssetVersion, version_id)
    if version is None:
        raise HTTPException(404, f"Version '{version_id}' not found.")
    return _version_out(version)


@app.get("/versions/{version_id}/file")
def get_version_file(version_id: str, db: Session = Depends(get_session)):
    """Serve the original .glb/.gltf so the frontend's Three.js viewer can load it."""
    version = db.get(AssetVersion, version_id)
    if version is None:
        raise HTTPException(404, f"Version '{version_id}' not found.")
    if not version.original_file_path or not os.path.isfile(version.original_file_path):
        raise HTTPException(404, "Original file is missing from storage.")
    return FileResponse(version.original_file_path, media_type="model/gltf-binary")


# --- Diffs -----------------------------------------------------------------------

@app.post("/diffs")
def compute_diff(
    version_a_id: str = Form(...),
    version_b_id: str = Form(...),
    epsilon: float = Form(1e-4),
    db: Session = Depends(get_session),
):
    if version_a_id == version_b_id:
        raise HTTPException(400, "Cannot diff a version against itself.")

    version_a = db.get(AssetVersion, version_a_id)
    version_b = db.get(AssetVersion, version_b_id)
    if version_a is None or version_b is None:
        raise HTTPException(404, "One or both versions were not found.")
    if not (version_a.is_extracted and version_b.is_extracted):
        raise HTTPException(409, "Both versions must finish extraction before diffing.")

    # Cache hit: return the existing diff instead of recomputing (either
    # order), but only if it was computed with the same epsilon -- a diff
    # computed at a different noise threshold is a different result, and
    # silently returning it would contradict the "never silently give a
    # wrong answer" requirement.
    existing = (
        db.query(DiffResult)
        .filter(
            (
                ((DiffResult.version_a_id == version_a_id) & (DiffResult.version_b_id == version_b_id))
                | ((DiffResult.version_a_id == version_b_id) & (DiffResult.version_b_id == version_a_id))
            )
            & (sqlalchemy.func.abs(DiffResult.epsilon - epsilon) < 1e-12)
        )
        .first()
    )
    if existing is not None:
        return _diff_out(existing)

    try:
        diff_payload = diff_assets(
            version_a.extracted_json_path,
            version_b.extracted_json_path,
            storage.extracted_dir(version_a.project_id, version_a.id),
            storage.extracted_dir(version_b.project_id, version_b.id),
            epsilon=epsilon,
        )
    except FileNotFoundError as exc:
        raise HTTPException(500, f"Could not load extracted data: {exc}") from exc

    diff = DiffResult(
        version_a_id=version_a_id,
        version_b_id=version_b_id,
        epsilon=epsilon,
        diff_json=json.dumps(diff_payload),
        geometry_exact=diff_payload["geometry"]["geometry_exact"],
    )
    db.add(diff)
    db.commit()
    db.refresh(diff)

    return _diff_out(diff)


@app.get("/diffs/{diff_id}")
def get_diff(diff_id: str, db: Session = Depends(get_session)):
    diff = db.get(DiffResult, diff_id)
    if diff is None:
        raise HTTPException(404, f"Diff '{diff_id}' not found.")
    return _diff_out(diff)


@app.get("/projects/{project_id}/diffs")
def list_project_diffs(project_id: str, db: Session = Depends(get_session)):
    version_ids = {v.id for v in db.query(AssetVersion).filter_by(project_id=project_id)}
    diffs = (
        db.query(DiffResult)
        .filter(DiffResult.version_a_id.in_(version_ids))
        .order_by(DiffResult.computed_at.desc())
        .all()
    )
    return [_diff_out(d) for d in diffs]


# --- Response shaping --------------------------------------------------------------

def _project_out(project: Project) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "created_at": project.created_at.isoformat(),
    }


def _version_out(version: AssetVersion) -> dict:
    return {
        "id": version.id,
        "project_id": version.project_id,
        "filename": version.filename,
        "uploaded_at": version.uploaded_at.isoformat(),
        "is_extracted": version.is_extracted,
    }


def _diff_out(diff: DiffResult) -> dict:
    return {
        "id": diff.id,
        "version_a_id": diff.version_a_id,
        "version_b_id": diff.version_b_id,
        "computed_at": diff.computed_at.isoformat(),
        "epsilon": diff.epsilon,
        "geometry_exact": diff.geometry_exact,
        "diff": json.loads(diff.diff_json),
    }
