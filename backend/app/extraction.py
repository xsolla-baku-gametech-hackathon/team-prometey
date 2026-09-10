"""
Extraction ("split") pipeline for MeshDiff.

Takes a .glb/.gltf file and produces:
    - meta.json           materials + node hierarchy/transforms (structured, diffable)
    - geometry/<mesh>.npz  raw vertex/index buffers per mesh (binary, NOT text-serialized)

Per the build spec: geometry is never converted to text. We store raw numpy
buffers plus a content hash per mesh, and diff geometry numerically later.

Uses trimesh (built on pygltflib under the hood) since it gives us a
scene graph (node hierarchy + transforms) and per-mesh material access in
one API, rather than walking the raw glTF JSON ourselves.
"""

import hashlib
import json
import os

import numpy as np
import trimesh


class ExtractionError(Exception):
    """Raised when a file can't be parsed or is malformed."""


def extract_asset(source_path: str, output_dir: str) -> str:
    """
    Extract materials/hierarchy/geometry from a .glb/.gltf file.

    Args:
        source_path: path to the uploaded .glb/.gltf file.
        output_dir: directory to write meta.json + geometry/*.npz into.
                    Created if it doesn't exist.

    Returns:
        Path to the written meta.json file.

    Raises:
        ExtractionError: if the file is missing, unreadable, or not a
        valid glTF/GLB scene.
    """
    if not os.path.isfile(source_path):
        raise ExtractionError(f"File not found: {source_path}")

    try:
        scene = trimesh.load(source_path, process=False, force="scene")
    except Exception as exc:  # trimesh raises various error types depending on failure
        raise ExtractionError(f"Could not parse '{os.path.basename(source_path)}': {exc}") from exc

    if not isinstance(scene, trimesh.Scene) or len(scene.geometry) == 0:
        raise ExtractionError(
            f"'{os.path.basename(source_path)}' has no readable geometry. "
            "Is this a valid glTF/GLB file?"
        )

    os.makedirs(output_dir, exist_ok=True)
    geometry_dir = os.path.join(output_dir, "geometry")
    os.makedirs(geometry_dir, exist_ok=True)

    materials = _extract_materials(scene)
    nodes = _extract_hierarchy(scene)
    geometry_refs = _extract_geometry(scene, geometry_dir)

    meta = {
        "source_filename": os.path.basename(source_path),
        "materials": materials,
        "nodes": nodes,
        "geometry": geometry_refs,
    }

    meta_path = os.path.join(output_dir, "meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    return meta_path


def _extract_materials(scene: trimesh.Scene) -> list[dict]:
    """
    One entry per unique mesh material, matched by name.
    If a mesh has no name, its geometry key is used as a fallback name so
    later diffing (which matches by name) has something to key on.
    """
    materials = []
    seen_names = set()

    for mesh_name, geom in scene.geometry.items():
        material = getattr(geom.visual, "material", None)
        name = getattr(material, "name", None) or mesh_name

        if name in seen_names:
            continue
        seen_names.add(name)

        entry = {"name": name}

        if material is None:
            materials.append(entry)
            continue

        # PBRMaterial is the common case for glTF; fall back gracefully
        # for anything else (e.g. plain color materials).
        base_color = getattr(material, "baseColorFactor", None)
        if base_color is not None:
            # trimesh sometimes stores this as 0-255 (uint8-style) rather
            # than glTF's native 0-1 range. Normalize so diffs are meaningful.
            values = [float(c) for c in list(base_color)]
            if any(v > 1.0 for v in values):
                values = [v / 255.0 for v in values]
            entry["base_color"] = [round(v, 6) for v in values]

        metallic = getattr(material, "metallicFactor", None)
        if metallic is not None:
            entry["metallic_factor"] = round(float(metallic), 6)

        roughness = getattr(material, "roughnessFactor", None)
        if roughness is not None:
            entry["roughness_factor"] = round(float(roughness), 6)

        emissive = getattr(material, "emissiveFactor", None)
        if emissive is not None:
            entry["emissive_factor"] = [round(float(c), 6) for c in list(emissive)]

        materials.append(entry)

    return materials


def _extract_hierarchy(scene: trimesh.Scene) -> list[dict]:
    """
    Flat list of nodes with name, parent name, geometry key (if any),
    and decomposed transform (translation/rotation-quaternion/scale).
    """
    graph = scene.graph
    nodes = []

    for node_name in graph.nodes:
        transform, geometry_key = graph.get(node_name)

        nodes.append(
            {
                "name": node_name,
                "geometry_key": geometry_key,
                **_decompose_transform(transform),
            }
        )

    # Parent/child relationships: trimesh exposes them via graph.transforms
    # as a directed graph. Walk edges directly rather than the loop above.
    parent_of = {}
    try:
        for parent, child in graph.transforms.edges:
            parent_of[child] = parent
    except AttributeError:
        # Older trimesh versions expose this differently; degrade gracefully
        # rather than failing extraction over a missing "nice to have" field.
        pass

    for node in nodes:
        node["parent"] = parent_of.get(node["name"])

    return nodes


def _decompose_transform(matrix: np.ndarray) -> dict:
    """Break a 4x4 transform matrix into translation / rotation (quaternion) / scale."""
    translation = matrix[:3, 3]

    # Scale = length of each column's rotation part; strip it out to get
    # a pure rotation matrix before converting to quaternion.
    m3 = matrix[:3, :3]
    scale = np.linalg.norm(m3, axis=0)
    scale_safe = np.where(scale == 0, 1, scale)
    rotation_matrix = m3 / scale_safe

    quaternion = trimesh.transformations.quaternion_from_matrix(
        np.vstack([np.hstack([rotation_matrix, [[0], [0], [0]]]), [0, 0, 0, 1]])
    )

    return {
        "translation": [round(float(v), 6) for v in translation],
        "rotation_quaternion": [round(float(v), 6) for v in quaternion],  # (w, x, y, z)
        "scale": [round(float(v), 6) for v in scale],
    }


def _extract_geometry(scene: trimesh.Scene, geometry_dir: str) -> list[dict]:
    """
    Save raw vertex/index buffers per mesh as .npz (binary, not text) and
    record a content hash + vertex/face counts in the returned metadata.
    """
    refs = []

    for mesh_name, geom in scene.geometry.items():
        vertices = np.asarray(geom.vertices, dtype=np.float64)
        faces = np.asarray(geom.faces, dtype=np.int64)

        content_hash = hashlib.sha256(vertices.tobytes() + faces.tobytes()).hexdigest()

        safe_name = _safe_filename(mesh_name)
        buffer_path = os.path.join(geometry_dir, f"{safe_name}.npz")
        np.savez_compressed(buffer_path, vertices=vertices, faces=faces)

        refs.append(
            {
                "mesh_name": mesh_name,
                "vertex_count": int(vertices.shape[0]),
                "face_count": int(faces.shape[0]),
                "content_hash": content_hash,
                "buffer_file": os.path.relpath(buffer_path, os.path.dirname(geometry_dir)),
            }
        )

    return refs


def _safe_filename(name: str) -> str:
    """Mesh names can contain slashes/spaces; make a filesystem-safe version."""
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name) or "mesh"


def load_geometry_buffers(output_dir: str, buffer_file: str) -> tuple[np.ndarray, np.ndarray]:
    """Load back a mesh's (vertices, faces) from its saved .npz buffer file."""
    path = os.path.join(output_dir, buffer_file)
    data = np.load(path)
    return data["vertices"], data["faces"]
