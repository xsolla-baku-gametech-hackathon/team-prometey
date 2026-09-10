import React, { useState } from "react";
import { DiffResult, MeshDiffData } from "@/types";
import { Box, Palette, GitFork, ChevronRight, MousePointerClick } from "lucide-react";

interface ChangelogPanelProps {
  diffResult: DiffResult | null;
  /** Called with a mesh name when a row is clicked, so the viewport can flash it. */
  onMeshClick?: (meshName: string) => void;
}

type LineKind = "add" | "remove" | "context";

/** One line of a GitHub-style diff hunk: a leading +/-/space gutter plus colored background. */
function DiffLine({ kind, children }: { kind: LineKind; children: React.ReactNode }) {
  const styles: Record<LineKind, string> = {
    add: "bg-emerald-500/10 text-emerald-300 border-l-2 border-emerald-500",
    remove: "bg-red-500/10 text-red-300 border-l-2 border-red-500",
    context: "text-gray-500 border-l-2 border-transparent",
  };
  const prefix = { add: "+", remove: "-", context: " " }[kind];
  return (
    <div className={`font-mono text-[10px] leading-5 px-2 whitespace-pre-wrap break-all ${styles[kind]}`}>
      <span className="opacity-50 mr-1.5 select-none">{prefix}</span>
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
  const border = { add: "border-l-emerald-500", remove: "border-l-red-500", context: "border-l-[#3d4758]" }[kind];
  const symbol = { add: "+", remove: "−", context: "~" }[kind];
  const symbolColor = { add: "text-emerald-400", remove: "text-red-400", context: "text-amber-400" }[kind];
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded border-l-2 ${border} bg-[#181c24] ${
        onClick ? "cursor-pointer hover:bg-[#1f2530]" : ""
      } transition-colors`}
      title={onClick ? "Click to locate in 3D viewport" : undefined}
    >
      <span className={`font-mono text-[11px] font-bold w-3 text-center ${symbolColor}`}>{symbol}</span>
      <span className="font-mono text-[11px] text-gray-200 truncate flex-1">{label}</span>
      {detail && <span className="text-[10px] text-gray-500 whitespace-nowrap">{detail}</span>}
      {onClick && (
        <MousePointerClick className="w-3 h-3 text-gray-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
    <div className="px-3 py-2 bg-white/[0.02] border-b border-[#293040] flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-200">
        {icon} {title}
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0b0d10] text-gray-400">{count}</span>
    </div>
  );
}

function meshBar(m: MeshDiffData) {
  if (m.unchanged) return { widthPct: 0, colorClass: "bg-gray-600" };
  if (!m.changed_vertex_indices && !m.unchanged) {
    return { widthPct: 100, colorClass: "bg-blue-500" }; // topology change, no per-vertex data
  }
  return { widthPct: Math.min(Math.max(m.changed_vertex_percent, 0), 100), colorClass: "bg-gradient-to-r from-amber-500 to-red-500" };
}

export const ChangelogPanel: React.FC<ChangelogPanelProps> = ({ diffResult, onMeshClick }) => {
  const [showUnchanged, setShowUnchanged] = useState(false);

  if (!diffResult) {
    return (
      <div className="w-[380px] bg-[#181c24] border-l border-[#293040] flex flex-col h-full flex-shrink-0">
        <div className="p-3.5 border-b border-[#293040] flex items-center justify-between">
          <span className="text-xs font-bold text-gray-200">Diff Inspector & Summary</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-gray-500">
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
    <div className="w-[380px] bg-[#181c24] border-l border-[#293040] flex flex-col h-full flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-3.5 border-b border-[#293040] flex items-center justify-between">
        <span className="text-xs font-bold text-gray-200">Diff Inspector & Summary</span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
            geometry_exact
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
          }`}
        >
          {geometry_exact ? "Index-Aligned Exact" : "Topology Approx"}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#202632] border border-[#293040] rounded-lg p-2.5">
            <div className={`text-lg font-bold ${geom.changed_percent > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {geom.changed_percent}%
            </div>
            <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mt-0.5">Geometry Delta</div>
          </div>
          <div className="bg-[#202632] border border-[#293040] rounded-lg p-2.5">
            <div className="text-lg font-bold text-gray-100">{geom.total_changed_vertices.toLocaleString()}</div>
            <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mt-0.5">Changed Vertices</div>
          </div>
          <div className="bg-[#202632] border border-[#293040] rounded-lg p-2.5">
            <div className="text-lg font-bold text-gray-100">{matDeltas}</div>
            <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mt-0.5">Material Deltas</div>
          </div>
          <div className="bg-[#202632] border border-[#293040] rounded-lg p-2.5">
            <div className="text-lg font-bold text-gray-100">{hierDeltas}</div>
            <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mt-0.5">Hierarchy Deltas</div>
          </div>
        </div>

        {/* Summary line, GitHub PR-style */}
        <div className="flex items-center gap-3 text-[11px] font-mono px-1">
          <span className="text-gray-400">{totalMeshEntries} mesh{totalMeshEntries !== 1 ? "es" : ""}</span>
          <span className="text-amber-400">~{changedMeshes.length} changed</span>
          <span className="text-emerald-400">+{geom.added_meshes.length} added</span>
          <span className="text-red-400">−{geom.removed_meshes.length} removed</span>
        </div>

        {/* 1. Geometry Section */}
        <div className="bg-[#202632] border border-[#293040] rounded-lg overflow-hidden">
          <SectionHeader icon={<Box className="w-3.5 h-3.5 text-blue-400" />} title="Geometry Breakdown" count={totalMeshEntries} />
          <div className="p-3 text-xs space-y-2">
            <div className="text-gray-400 text-[11px] leading-relaxed">{geom.summary}</div>
            {!geometry_exact && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
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
                    <div className="ml-6 mr-2 mt-0.5 mb-1 h-1 rounded bg-black/30 overflow-hidden">
                      <div className={`h-full ${bar.colorClass}`} style={{ width: `${bar.widthPct || 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {unchangedMeshes.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setShowUnchanged((v) => !v)}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
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

            {totalMeshEntries === 0 && <div className="text-gray-500 text-[11px]">No mesh changes detected.</div>}
          </div>
        </div>

        {/* 2. Materials Section */}
        <div className="bg-[#202632] border border-[#293040] rounded-lg overflow-hidden">
          <SectionHeader icon={<Palette className="w-3.5 h-3.5 text-indigo-400" />} title="Materials & PBR Properties" count={matDeltas} />
          <div className="p-3 text-xs space-y-2">
            <div className="text-gray-400 text-[11px]">{diff.materials.summary}</div>
            <div className="space-y-1.5 pt-1">
              {diff.materials.added.map((m) => (
                <DiffRow key={`madd-${m.name}`} kind="add" label={m.name} />
              ))}
              {diff.materials.removed.map((m) => (
                <DiffRow key={`mrem-${m.name}`} kind="remove" label={m.name} />
              ))}
              {diff.materials.changed.map((m) => (
                <div key={m.name} className="rounded overflow-hidden border border-[#293040]/60">
                  <div className="px-2 py-1 bg-[#181c24] font-semibold text-amber-400 text-[11px] font-mono">~ {m.name}</div>
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
            {matDeltas === 0 && <div className="text-gray-500 text-[11px]">No material changes detected.</div>}
          </div>
        </div>

        {/* 3. Hierarchy Section */}
        <div className="bg-[#202632] border border-[#293040] rounded-lg overflow-hidden">
          <SectionHeader icon={<GitFork className="w-3.5 h-3.5 text-emerald-400" />} title="Hierarchy & Transforms" count={hierDeltas} />
          <div className="p-3 text-xs space-y-2">
            <div className="text-gray-400 text-[11px]">{diff.hierarchy.summary}</div>
            {diff.hierarchy.note && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
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
                <div key={`repar-${n.name}`} className="rounded overflow-hidden border border-[#293040]/60">
                  <div className="px-2 py-1 bg-[#181c24] font-semibold text-gray-200 text-[11px] font-mono">~ {n.name} (reparented)</div>
                  <DiffLine kind="remove">{`parent: ${n.old_parent ?? "root"}`}</DiffLine>
                  <DiffLine kind="add">{`parent: ${n.new_parent ?? "root"}`}</DiffLine>
                </div>
              ))}
              {diff.hierarchy.moved.map((n) => (
                <div key={`moved-${n.name}`} className="rounded overflow-hidden border border-[#293040]/60">
                  <div className="px-2 py-1 bg-[#181c24] font-semibold text-gray-200 text-[11px] font-mono">~ {n.name} (transform)</div>
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

            {hierDeltas === 0 && <div className="text-gray-500 text-[11px]">No transform or node hierarchy changes.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
