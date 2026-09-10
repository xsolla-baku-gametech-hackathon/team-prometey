"""
Diff computation for MeshDiff.

Takes two extracted meta.json outputs (see extraction.py) and produces a
single diff payload covering materials, node hierarchy/transforms, and
geometry.

Geometry diff strategy (per build spec):
    - If a mesh's vertex count matches between versions, compare vertex i
      to vertex i directly (index-aligned) -- exact.
    - If vertex counts differ (topology changed), fall back to nearest-
      neighbor matching in 3D space -- approximate, and labeled as such.
      We never silently present a nearest-neighbor result as exact.

A vertex is "changed" if its displacement exceeds `epsilon` (default
1e-4), to avoid floating-point noise showing up as changes.
"""

import json
import os

import numpy as np

try:
    from scipy.spatial import cKDTree
    _SCIPY_AVAILABLE = True
except ImportError:
    _SCIPY_AVAILABLE = False

from app.extraction import load_geometry_buffers

DEFAULT_EPSILON = 1e-4


def diff_assets(
    meta_a_path: str,
    meta_b_path: str,
    output_dir_a: str,
    output_dir_b: str,
    epsilon: float = DEFAULT_EPSILON,
) -> dict:
    """
    Compute the full diff between two extracted assets.

    Args:
        meta_a_path / meta_b_path: paths to each version's meta.json.
        output_dir_a / output_dir_b: extraction output dirs (needed to
            load the raw geometry .npz buffers referenced from meta.json).
        epsilon: minimum displacement to count a vertex as "changed".

    Returns:
        A JSON-serializable dict with "materials", "hierarchy", and
        "geometry" diff sections.
    """
    meta_a = _load_meta(meta_a_path)
    meta_b = _load_meta(meta_b_path)

    return {
        "materials": _diff_materials(meta_a["materials"], meta_b["materials"]),
        "hierarchy": _diff_hierarchy(meta_a["nodes"], meta_b["nodes"]),
        "geometry": _diff_geometry(
            meta_a["geometry"], meta_b["geometry"], output_dir_a, output_dir_b, epsilon
        ),
    }


def _load_meta(path: str) -> dict:
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Extracted metadata not found: {path}")
    with open(path) as f:
        return json.load(f)


# --- Materials ---------------------------------------------------------------

def _diff_materials(materials_a: list[dict], materials_b: list[dict]) -> dict:
    """Match materials by name. Report added, removed, changed (old -> new)."""
    by_name_a = {m["name"]: m for m in materials_a}
    by_name_b = {m["name"]: m for m in materials_b}

    added = [m for name, m in by_name_b.items() if name not in by_name_a]
    removed = [m for name, m in by_name_a.items() if name not in by_name_b]

    changed = []
    for name in set(by_name_a) & set(by_name_b):
        mat_a, mat_b = by_name_a[name], by_name_b[name]
        field_changes = {}
        for field in set(mat_a) | set(mat_b):
            if field == "name":
                continue
            if mat_a.get(field) != mat_b.get(field):
                field_changes[field] = {"old": mat_a.get(field), "new": mat_b.get(field)}
        if field_changes:
            changed.append({"name": name, "changes": field_changes})

    return {
        "added": added,
        "removed": removed,
        "changed": changed,
        "summary": f"{len(added)} added, {len(removed)} removed, {len(changed)} changed",
    }


# --- Hierarchy / transforms ---------------------------------------------------

def _diff_hierarchy(nodes_a: list[dict], nodes_b: list[dict]) -> dict:
    """
    Match nodes by name (documented limitation: renamed nodes show as
    remove+add, not a rename -- flagged for a future persistent-ID approach).
    """
    by_name_a = {n["name"]: n for n in nodes_a}
    by_name_b = {n["name"]: n for n in nodes_b}

    added = [n for name, n in by_name_b.items() if name not in by_name_a]
    removed = [n for name, n in by_name_a.items() if name not in by_name_b]

    moved = []
    reparented = []
    for name in set(by_name_a) & set(by_name_b):
        node_a, node_b = by_name_a[name], by_name_b[name]

        if node_a.get("parent") != node_b.get("parent"):
            reparented.append(
                {"name": name, "old_parent": node_a.get("parent"), "new_parent": node_b.get("parent")}
            )

        transform_changed = (
            node_a.get("translation") != node_b.get("translation")
            or node_a.get("rotation_quaternion") != node_b.get("rotation_quaternion")
            or node_a.get("scale") != node_b.get("scale")
        )
        if transform_changed:
            moved.append(
                {
                    "name": name,
                    "old_translation": node_a.get("translation"),
                    "new_translation": node_b.get("translation"),
                    "old_rotation_quaternion": node_a.get("rotation_quaternion"),
                    "new_rotation_quaternion": node_b.get("rotation_quaternion"),
                    "old_scale": node_a.get("scale"),
                    "new_scale": node_b.get("scale"),
                }
            )

    return {
        "added": added,
        "removed": removed,
        "moved": moved,
        "reparented": reparented,
        "summary": (
            f"{len(added)} added, {len(removed)} removed, "
            f"{len(moved)} moved, {len(reparented)} reparented"
        ),
        "note": "Nodes are matched by name; a renamed node appears as remove+add.",
    }


# --- Geometry ------------------------------------------------------------------

def _diff_geometry(
    geometry_a: list[dict],
    geometry_b: list[dict],
    output_dir_a: str,
    output_dir_b: str,
    epsilon: float,
) -> dict:
    """
    Match meshes by name. For each pair present in both versions, compute
    a per-vertex diff (index-aligned if counts match, nearest-neighbor
    fallback otherwise). Meshes only in one version are added/removed.
    """
    by_name_a = {g["mesh_name"]: g for g in geometry_a}
    by_name_b = {g["mesh_name"]: g for g in geometry_b}

    added = [{"mesh_name": name, "vertex_count": by_name_b[name]["vertex_count"]}
             for name in by_name_b if name not in by_name_a]
    removed = [{"mesh_name": name, "vertex_count": by_name_a[name]["vertex_count"]}
               for name in by_name_a if name not in by_name_b]

    meshes = []
    any_approximate = False

    for name in set(by_name_a) & set(by_name_b):
        ref_a, ref_b = by_name_a[name], by_name_b[name]

        if ref_a["content_hash"] == ref_b["content_hash"]:
            meshes.append(
                {
                    "mesh_name": name,
                    "unchanged": True,
                    "exact": True,
                    "vertex_count": ref_a["vertex_count"],
                    "changed_vertex_count": 0,
                    "changed_vertex_percent": 0.0,
                }
            )
            continue

        verts_a, _faces_a = load_geometry_buffers(output_dir_a, ref_a["buffer_file"])
        verts_b, faces_b = load_geometry_buffers(output_dir_b, ref_b["buffer_file"])

        if verts_a.shape[0] == verts_b.shape[0]:
            result = _diff_geometry_exact(verts_a, verts_b, epsilon)
        else:
            result = _diff_geometry_approximate(verts_a, verts_b, epsilon)
            any_approximate = True

        result["mesh_name"] = name
        result["unchanged"] = False
        meshes.append(result)

    # total_vertices/total_changed_vertices describe V2 -- the version
    # actually rendered in the viewport -- so the percentage means "how much
    # of what you're looking at right now is different from before":
    #   - matched meshes contribute their real vertex/changed counts.
    #   - added meshes are entirely new geometry (100% changed) and DO exist
    #     in V2, so they count toward both total and changed.
    #   - removed meshes do NOT exist in V2 at all -- folding their vertices
    #     into this ratio would count vertices you can never actually see in
    #     the diff view, and could even overstate "changed" beyond what's
    #     rendered. They're still fully reported, just separately, via
    #     removed_meshes.
    matched_total = sum(m["vertex_count"] for m in meshes)
    matched_changed = sum(m["changed_vertex_count"] for m in meshes)
    added_total = sum(m["vertex_count"] for m in added)

    total_vertices = matched_total + added_total
    total_changed = matched_changed + added_total

    return {
        "added_meshes": added,
        "removed_meshes": removed,
        "meshes": meshes,
        "geometry_exact": not any_approximate,
        "total_vertices": total_vertices,
        "total_changed_vertices": total_changed,
        "changed_percent": round(100.0 * total_changed / total_vertices, 2) if total_vertices else 0.0,
        "summary": _geometry_summary(total_changed, total_vertices, any_approximate),
    }


def _diff_geometry_exact(verts_a: np.ndarray, verts_b: np.ndarray, epsilon: float) -> dict:
    """Vertex counts match: compare vertex i to vertex i directly."""
    displacement = np.linalg.norm(verts_b - verts_a, axis=1)
    changed_mask = displacement > epsilon

    return {
        "exact": True,
        "vertex_count": int(verts_b.shape[0]),
        "changed_vertex_count": int(changed_mask.sum()),
        "changed_vertex_percent": round(100.0 * changed_mask.sum() / len(displacement), 2),
        # per-vertex data for the frontend to color-code the mesh
        "changed_vertex_indices": np.nonzero(changed_mask)[0].tolist(),
        "displacements": [round(float(d), 6) for d in displacement],
    }


def _diff_geometry_approximate(verts_a: np.ndarray, verts_b: np.ndarray, epsilon: float) -> dict:
    """
    Vertex counts differ (topology changed): for each vertex in B, find its
    nearest neighbor in A and use that distance as an approximate
    displacement. This is a best-effort correspondence, not a guarantee --
    always surfaced as "exact": False so the UI can label it "approximate".
    """
    if not _SCIPY_AVAILABLE:
        raise RuntimeError(
            "scipy is required for nearest-neighbor geometry diff (topology changed between versions). "
            "Install it with: pip install scipy"
        )
    tree = cKDTree(verts_a)
    nearest_distance, _nearest_index = tree.query(verts_b, k=1)
    changed_mask = nearest_distance > epsilon

    return {
        "exact": False,
        "vertex_count": int(verts_b.shape[0]),
        "old_vertex_count": int(verts_a.shape[0]),
        "changed_vertex_count": int(changed_mask.sum()),
        "changed_vertex_percent": round(100.0 * changed_mask.sum() / len(nearest_distance), 2),
        "changed_vertex_indices": np.nonzero(changed_mask)[0].tolist(),
        "displacements": [round(float(d), 6) for d in nearest_distance],
        "note": (
            "Vertex count changed between versions; displacement is approximate "
            "(nearest-neighbor matching), not an exact index-aligned comparison."
        ),
    }


def _geometry_summary(changed: int, total: int, approximate: bool) -> str:
    if total == 0:
        return "No shared meshes to compare."
    pct = round(100.0 * changed / total, 1)
    base = f"{changed} of {total} vertices changed ({pct}%)"
    return base + " — approximate, topology changed" if approximate else base
