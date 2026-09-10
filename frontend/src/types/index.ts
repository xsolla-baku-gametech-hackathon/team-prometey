export interface Project {
  id: string;
  name: string;
  created_at: string;
  versions?: AssetVersion[];
}

export interface AssetVersion {
  id: string;
  project_id: string;
  filename: string;
  uploaded_at: string;
  is_extracted: boolean;
}

export interface MaterialDiffItem {
  name: string;
  base_color?: number[];
  metallic_factor?: number;
  roughness_factor?: number;
  emissive_factor?: number[];
  changes?: Record<string, { old: any; new: any }>;
}

export interface MaterialsDiff {
  added: MaterialDiffItem[];
  removed: MaterialDiffItem[];
  changed: { name: string; changes: Record<string, { old: any; new: any }> }[];
  summary: string;
}

export interface HierarchyNode {
  name: string;
  geometry_key?: string;
  translation?: number[];
  rotation_quaternion?: number[];
  scale?: number[];
  parent?: string | null;
}

export interface HierarchyMovedNode {
  name: string;
  old_translation?: number[];
  new_translation?: number[];
  old_rotation_quaternion?: number[];
  new_rotation_quaternion?: number[];
  old_scale?: number[];
  new_scale?: number[];
}

export interface HierarchyDiff {
  added: HierarchyNode[];
  removed: HierarchyNode[];
  moved: HierarchyMovedNode[];
  reparented: { name: string; old_parent: string | null; new_parent: string | null }[];
  summary: string;
  note?: string;
}

export interface MeshDiffData {
  mesh_name: string;
  unchanged?: boolean;
  exact: boolean;
  vertex_count: number;
  old_vertex_count?: number;
  changed_vertex_count: number;
  changed_vertex_percent: number;
  changed_vertex_indices?: number[];
  displacements?: number[];
  note?: string;
}

export interface GeometryDiff {
  added_meshes: string[];
  removed_meshes: string[];
  meshes: MeshDiffData[];
  geometry_exact: boolean;
  total_vertices: number;
  total_changed_vertices: number;
  changed_percent: number;
  summary: string;
}

export interface DiffPayload {
  materials: MaterialsDiff;
  hierarchy: HierarchyDiff;
  geometry: GeometryDiff;
}

export interface DiffResult {
  id: string;
  version_a_id: string;
  version_b_id: string;
  computed_at: string;
  geometry_exact: boolean;
  diff: DiffPayload;
}
