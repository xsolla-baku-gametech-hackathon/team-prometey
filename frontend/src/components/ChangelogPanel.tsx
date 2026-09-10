import React, { useState } from "react";
import { DiffResult, MeshDiffData } from "@/types";
import { Box, Palette, GitFork, ChevronRight, MousePointerClick } from "lucide-react";

interface ChangelogPanelProps {
  diffResult: DiffResult | null;
  /** Called with a mesh name when a row is clicked, so the viewport can flash it. */
  onMeshClick?: (meshName: string) => void;
  /** Called with a mesh name + vertex index so the viewport can fly the camera to it. */
  onVertexClick?: (meshName: string, vertexIndex: number) => void;
}

const MAX_VERTEX_ROWS = 50;

type LineKind = "add" | "remove" | "context";

/** One line of a GitHub-style diff hunk: a leading +/-/space gutter plus a colored wash. */
function DiffLine({ kind, children }: { kind: LineKind; children: React.ReactNode }) {
  const styles: Record<LineKind, string> = {
    add: "bg-[#ecfdf5] text-[#059669] border-l-2 border-[#059669]",
    remove: "bg-[#fef2f2] text-[#ef4444] border-l-2 border-[#ef4444]",
    context: "text-[#94a3b8] border-l-2 border-transparent",
  };
  const prefix = { add: "+", remove: "-", context: " " }[kind];
  return (
    <div className={`font-mono text-[10px] leading-5 px-2 whitespace-pre-wrap break-all ${styles[kind]}`}>
      <span className="opacity-60 mr-1.5 select-none">{prefix}</span>
      {children}
    </div>
  );
}

/** A single row in a diff list — the "+file.glb" / "-file.glb" line of a GitHub diff. */
function DiffRow({
  kind,
  label,
  detail,
  onClick,
}: {
  kind: LineKind;
  label: string;
  detail?: string;
  onClick?: () => void;
}) {
  const border = { add: "border-l-[#059669]", remove: "border-l-[#ef4444]", context: "border-l-[#2563eb]" }[kind];
  const symbol = { add: "+", remove: "−", context: "~" }[kind];
  const symbolColor = { add: "text-[#059669]", remove: "text-[#ef4444]", context: "text-[#2563eb]" }[kind];
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded border-l-2 ${border} bg-[#f8fafc] ${
        onClick ? "cursor-pointer hover:bg-[#f1f5f9]" : ""
      } transition-colors`}
      title={onClick ? "Click to locate in 3D viewport" : undefined}
    >
      <span className={`font-mono text-[11px] font-bold w-3 text-center ${symbolColor}`}>{symbol}</span>
      <span className="font-mono text-[11px] text-[#0f172a] truncate flex-1">{label}</span>
      {detail && <span className="text-[10px] text-[#94a3b8] whitespace-nowrap">{detail}</span>}
      {onClick && (
        <MousePointerClick className="w-3 h-3 text-[#cbd5e1] group-hover:text-[#2563eb] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="px-3 py-2 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
        {icon} {title}
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-[#64748b] border border-[#e2e8f0]">{count}</span>
    </div>
  );
}

function meshBar(m: MeshDiffData) {
  if (m.unchanged) return { widthPct: 0, colorClass: "bg-[#cbd5e1]" };
  if (!m.changed_vertex_indices) {
    return { widthPct: 100, colorClass: "bg-[#2563eb]" }; // topology change, no per-vertex data
  }
  return { widthPct: Math.min(Math.max(m.changed_vertex_percent, 0), 100), colorClass: "bg-[#2563eb]" };
}

/** Changed vertex indices for one mesh, sorted by displacement magnitude, capped for the DOM. */
function topChangedVertices(m: MeshDiffData): { index: number; displacement: number }[] {
  if (!m.changed_vertex_indices) return [];
  const rows = m.changed_vertex_indices.map((index) => ({
    index,
    displacement: m.displacements?.[index] ?? 0,
  }));
  rows.sort((a, b) => b.displacement - a.displacement);
  return rows.slice(0, MAX_VERTEX_ROWS);
}

/** Expandable list of a mesh's changed vertices — click one to fly the camera to it. */
function VertexList({
  mesh,
  onVertexClick,
}: {
  mesh: MeshDiffData;
  onVertexClick?: (meshName: string, vertexIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!mesh.changed_vertex_indices?.length) return null;
  const rows = topChangedVertices(mesh);
  const truncated = mesh.changed_vertex_indices.length > rows.length;

  return (
    <div className="ml-6 mr-2 mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {open ? "Hide" : "Show"} changed vertices ({mesh.changed_vertex_count})
      </button>
      {open && (
        <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 border border-[#e2e8f0] rounded bg-[#f8fafc] p-1">
          {rows.map(({ index, displacement }) => (
            <div
              key={index}
              onClick={() => onVertexClick?.(mesh.mesh_name, index)}
              className={`flex items-center justify-between px-1.5 py-1 rounded text-[10px] font-mono ${
                onVertexClick ? "cursor-pointer hover:bg-[#eff6ff]" : ""
              }`}
              title={onVertexClick ? "Click to fly the camera to this vertex" : undefined}
            >
              <span className="text-[#334155]">vertex #{index}</span>
              <span className="text-[#2563eb]">Δ{displacement.toFixed(4)}</span>
            </div>
          ))}
          {truncated && (
            <div className="px-1.5 py-1 text-[9px] text-[#94a3b8]">
              showing top {rows.length} of {mesh.changed_vertex_count}, by displacement
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const ChangelogPanel: React.FC<ChangelogPanelProps> = ({ diffResult, onMeshClick, onVertexClick }) => {
  const [showUnchanged, setShowUnchanged] = useState(false);

  if (!diffResult) {
    return (
      <div className="w-[380px] bg-white border-l border-[#e2e8f0] flex flex-col h-full flex-shrink-0">
        <div className="p-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
          <span className="text-xs font-bold text-[#0f172a]">Diff Inspector & Summary</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-[#94a3b8]">
          No diff currently loaded. Select two asset versions to compute changes.
        </div>
      </div>
    );
  }

  const { diff, geometry_exact } = diffResult;
  const geom = diff.geometry;

  const changedMeshes = geom.meshes.filter((m) => !m.unchanged);
  const unchangedMeshes = geom.meshes.filter((m) => m.unchanged);
  const totalMeshEntries = geom.added_meshes.length + geom.removed_meshes.length + geom.meshes.length;

  const matDeltas = diff.materials.changed.length + diff.materials.added.length + diff.materials.removed.length;
  const hierDeltas =
    diff.hierarchy.moved.length +
    diff.hierarchy.added.length +
    diff.hierarchy.removed.length +
    diff.hierarchy.reparented.length;

  const click = (name: string) => (onMeshClick ? () => onMeshClick(name) : undefined);

  return (
    <div className="w-[380px] bg-white border-l border-[#e2e8f0] flex flex-col h-full flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
        <span className="text-xs font-bold text-[#0f172a]">Diff Inspector & Summary</span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
            geometry_exact
              ? "bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]"
              : "bg-[#fffbeb] text-[#d97706] border border-[#fde68a]"
          }`}
        >
          {geometry_exact ? "Index-Aligned Exact" : "Topology Approx"}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2.5">
            <div className={`text-lg font-bold ${geom.changed_percent > 0 ? "text-[#2563eb]" : "text-[#059669]"}`}>
              {geom.changed_percent}%
            </div>
            <div className="text-[10px] uppercase text-[#94a3b8] font-semibold tracking-wider mt-0.5">Geometry Delta</div>
          </div>
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2.5">
            <div className="text-lg font-bold text-[#0f172a]">{geom.total_changed_vertices.toLocaleString()}</div>
            <div className="text-[10px] uppercase text-[#94a3b8] font-semibold tracking-wider mt-0.5">Changed Vertices</div>
          </div>
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2.5">
            <div className="text-lg font-bold text-[#0f172a]">{matDeltas}</div>
            <div className="text-[10px] uppercase text-[#94a3b8] font-semibold tracking-wider mt-0.5">Material Deltas</div>
          </div>
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2.5">
            <div className="text-lg font-bold text-[#0f172a]">{hierDeltas}</div>
            <div className="text-[10px] uppercase text-[#94a3b8] font-semibold tracking-wider mt-0.5">Hierarchy Deltas</div>
          </div>
        </div>

        {/* Summary line, GitHub PR-style */}
        <div className="flex items-center gap-3 text-[11px] font-mono px-1">
          <span className="text-[#64748b]">{totalMeshEntries} mesh{totalMeshEntries !== 1 ? "es" : ""}</span>
          <span className="text-[#2563eb]">~{changedMeshes.length} changed</span>
          <span className="text-[#059669]">+{geom.added_meshes.length} added</span>
          <span className="text-[#ef4444]">−{geom.removed_meshes.length} removed</span>
        </div>

        {/* 1. Geometry Section */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
          <SectionHeader icon={<Box className="w-3.5 h-3.5 text-[#2563eb]" />} title="Geometry Breakdown" count={totalMeshEntries} />
          <div className="p-3 text-xs space-y-2">
            <div className="text-[#64748b] text-[11px] leading-relaxed">{geom.summary}</div>
            {!geometry_exact && (
              <div className="p-2 rounded bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[11px]">
                ⚠️ Topology mismatch on some meshes: displacement computed via nearest-neighbor point cloud
                distance, not an exact index-aligned comparison.
              </div>
            )}

            <div className="space-y-1 pt-1">
              {geom.added_meshes.map((name) => (
                <DiffRow key={`add-${name}`} kind="add" label={name} detail="new mesh" onClick={click(name)} />
              ))}
              {geom.removed_meshes.map((name) => (
                <DiffRow key={`rem-${name}`} kind="remove" label={name} detail="removed" onClick={click(name)} />
              ))}
              {changedMeshes.map((m) => {
                const bar = meshBar(m);
                return (
                  <div key={m.mesh_name}>
                    <DiffRow
                      kind="context"
                      label={m.mesh_name}
                      detail={
                        m.changed_vertex_indices
                          ? `${m.changed_vertex_count}/${m.vertex_count} (${m.changed_vertex_percent}%)`
                          : "topology Δ"
                      }
                      onClick={click(m.mesh_name)}
                    />
                    <div className="ml-6 mr-2 mt-0.5 mb-1 h-1 rounded bg-[#e2e8f0] overflow-hidden">
                      <div className={`h-full ${bar.colorClass}`} style={{ width: `${bar.widthPct || 100}%` }} />
                    </div>
                    <VertexList mesh={m} onVertexClick={onVertexClick} />
                  </div>
                );
              })}
            </div>

            {unchangedMeshes.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setShowUnchanged((v) => !v)}
                  className="flex items-center gap-1 text-[10px] text-[#94a3b8] hover:text-[#334155] transition-colors"
                >
                  <ChevronRight className={`w-3 h-3 transition-transform ${showUnchanged ? "rotate-90" : ""}`} />
                  {unchangedMeshes.length} unchanged mesh{unchangedMeshes.length !== 1 ? "es" : ""}
                </button>
                {showUnchanged && (
                  <div className="space-y-1 mt-1.5">
                    {unchangedMeshes.map((m) => (
                      <DiffRow key={m.mesh_name} kind="context" label={m.mesh_name} detail="no diff" onClick={click(m.mesh_name)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {totalMeshEntries === 0 && <div className="text-[#94a3b8] text-[11px]">No mesh changes detected.</div>}
          </div>
        </div>

        {/* 2. Materials Section */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
          <SectionHeader icon={<Palette className="w-3.5 h-3.5 text-[#2563eb]" />} title="Materials & PBR Properties" count={matDeltas} />
          <div className="p-3 text-xs space-y-2">
            <div className="text-[#64748b] text-[11px]">{diff.materials.summary}</div>
            <div className="space-y-1.5 pt-1">
              {diff.materials.added.map((m) => (
                <DiffRow key={`madd-${m.name}`} kind="add" label={m.name} />
              ))}
              {diff.materials.removed.map((m) => (
                <DiffRow key={`mrem-${m.name}`} kind="remove" label={m.name} />
              ))}
              {diff.materials.changed.map((m) => (
                <div key={m.name} className="rounded overflow-hidden border border-[#e2e8f0]">
                  <div className="px-2 py-1 bg-[#f8fafc] font-semibold text-[#2563eb] text-[11px] font-mono">~ {m.name}</div>
                  <div>
                    {Object.entries(m.changes).map(([k, v]) => (
                      <React.Fragment key={k}>
                        <DiffLine kind="remove">{`${k}: ${JSON.stringify(v.old)}`}</DiffLine>
                        <DiffLine kind="add">{`${k}: ${JSON.stringify(v.new)}`}</DiffLine>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {matDeltas === 0 && <div className="text-[#94a3b8] text-[11px]">No material changes detected.</div>}
          </div>
        </div>

        {/* 3. Hierarchy Section */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
          <SectionHeader icon={<GitFork className="w-3.5 h-3.5 text-[#2563eb]" />} title="Hierarchy & Transforms" count={hierDeltas} />
          <div className="p-3 text-xs space-y-2">
            <div className="text-[#64748b] text-[11px]">{diff.hierarchy.summary}</div>
            {diff.hierarchy.note && (
              <div className="p-2 rounded bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[11px]">
                ⚠️ {diff.hierarchy.note}
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              {diff.hierarchy.added.map((n) => (
                <DiffRow key={`nadd-${n.name}`} kind="add" label={n.name} detail="new node" />
              ))}
              {diff.hierarchy.removed.map((n) => (
                <DiffRow key={`nrem-${n.name}`} kind="remove" label={n.name} detail="removed" />
              ))}
              {diff.hierarchy.reparented.map((n) => (
                <div key={`repar-${n.name}`} className="rounded overflow-hidden border border-[#e2e8f0]">
                  <div className="px-2 py-1 bg-[#f8fafc] font-semibold text-[#0f172a] text-[11px] font-mono">~ {n.name} (reparented)</div>
                  <DiffLine kind="remove">{`parent: ${n.old_parent ?? "root"}`}</DiffLine>
                  <DiffLine kind="add">{`parent: ${n.new_parent ?? "root"}`}</DiffLine>
                </div>
              ))}
              {diff.hierarchy.moved.map((n) => (
                <div key={`moved-${n.name}`} className="rounded overflow-hidden border border-[#e2e8f0]">
                  <div className="px-2 py-1 bg-[#f8fafc] font-semibold text-[#0f172a] text-[11px] font-mono">~ {n.name} (transform)</div>
                  {n.old_translation && n.new_translation && (
                    <>
                      <DiffLine kind="remove">{`translation: [${n.old_translation.join(", ")}]`}</DiffLine>
                      <DiffLine kind="add">{`translation: [${n.new_translation.join(", ")}]`}</DiffLine>
                    </>
                  )}
                  {n.old_scale && n.new_scale && (
                    <>
                      <DiffLine kind="remove">{`scale: [${n.old_scale.join(", ")}]`}</DiffLine>
                      <DiffLine kind="add">{`scale: [${n.new_scale.join(", ")}]`}</DiffLine>
                    </>
                  )}
                </div>
              ))}
            </div>

            {hierDeltas === 0 && <div className="text-[#94a3b8] text-[11px]">No transform or node hierarchy changes.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
