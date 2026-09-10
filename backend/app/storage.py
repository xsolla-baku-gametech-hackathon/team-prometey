"""
Local filesystem storage layout for MeshDiff.

    STORAGE_ROOT/
      projects/
        <project_id>/
          versions/
            <version_id>/
              original.glb          # exactly as uploaded
              extracted/
                meta.json
                geometry/*.npz

Kept as plain path-building functions rather than a class -- there's only
one storage backend (local disk) for the hackathon build, so an abstract
"storage backend" layer would be premature.
"""

import os

STORAGE_ROOT = os.environ.get("MESHDIFF_STORAGE_ROOT", "./storage")


def project_dir(project_id: str) -> str:
    return os.path.join(STORAGE_ROOT, "projects", project_id)


def version_dir(project_id: str, version_id: str) -> str:
    return os.path.join(project_dir(project_id), "versions", version_id)


def original_file_path(project_id: str, version_id: str, filename: str) -> str:
    ext = os.path.splitext(filename)[1] or ".glb"
    return os.path.join(version_dir(project_id, version_id), f"original{ext}")


def extracted_dir(project_id: str, version_id: str) -> str:
    return os.path.join(version_dir(project_id, version_id), "extracted")


def ensure_version_dirs(project_id: str, version_id: str) -> None:
    os.makedirs(version_dir(project_id, version_id), exist_ok=True)
    os.makedirs(extracted_dir(project_id, version_id), exist_ok=True)
