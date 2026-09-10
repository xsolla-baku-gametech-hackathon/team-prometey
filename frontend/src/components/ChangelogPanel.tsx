import React from "react";
import { DiffResult } from "@/types";
import { CheckCircle2, AlertTriangle, Box, Palette, GitFork } from "lucide-react";

interface ChangelogPanelProps {
  diffResult: DiffResult | null;
}

export const ChangelogPanel: React.FC<ChangelogPanelProps> = ({ diffResult }) => {
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
            <div
              className={`text-lg font-bold ${
                diff.geometry.changed_percent > 0 ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              {diff.geometry.changed_percent}%
            </div>
            <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mt-0.5">
              Geometry Delta
            </div>
          </div>
          <div className="bg-[#202632] border border-[#293040] rounded-lg p-2.5">
            <div className="text-lg font-bold text-gray-100">
              {diff.geometry.total_changed_vertices.toLocaleString()}
            </div>
            <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mt-0.5">
              Changed Vertices
            </div>
          </div>
          <div className="bg-[#202632] border border-[#293040] rounded-lg p-2.5">
            <div className="text-lg font-bold text-gray-100">
              {diff.materials.changed.length + diff.materials.added.length + diff.materials.removed.length}
            </div>
            <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mt-0.5">
              Material Deltas
            </div>
          </div>
          <div className="bg-[#202632] border border-[#293040] rounded-lg p-2.5">
            <div className="text-lg font-bold text-gray-100">
              {diff.hierarchy.moved.length + diff.hierarchy.added.length + diff.hierarchy.removed.length}
            </div>
            <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mt-0.5">
              Hierarchy Deltas
            </div>
          </div>
        </div>

        {/* 1. Geometry Section */}
        <div className="bg-[#202632] border border-[#293040] rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-white/[0.02] border-b border-[#293040] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-200">
              <Box className="w-3.5 h-3.5 text-blue-400" /> Geometry Breakdown
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0b0d10] text-gray-400">
              {diff.geometry.meshes.length} meshes
            </span>
          </div>
          <div className="p-3 text-xs space-y-2">
            <div className="text-gray-400 text-[11px] leading-relaxed">{diff.geometry.summary}</div>
            {!geometry_exact && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                ⚠️ Topology mismatch: Computed using nearest-neighbor point cloud distance.
              </div>
            )}
            <div className="space-y-1.5 pt-1">
              {diff.geometry.meshes.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded bg-[#181c24] text-[11px]">
                  <span className="font-semibold text-gray-200 truncate">{m.mesh_name}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      m.unchanged
                        ? "bg-gray-700 text-gray-300"
                        : m.exact
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {m.unchanged ? "Unchanged" : `${m.changed_vertex_count}/${m.vertex_count} (${m.changed_vertex_percent}%)`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Materials Section */}
        <div className="bg-[#202632] border border-[#293040] rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-white/[0.02] border-b border-[#293040] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-200">
              <Palette className="w-3.5 h-3.5 text-indigo-400" /> Materials & PBR Properties
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0b0d10] text-gray-400">
              {diff.materials.changed.length + diff.materials.added.length + diff.materials.removed.length} changes
            </span>
          </div>
          <div className="p-3 text-xs space-y-2">
            <div className="text-gray-400 text-[11px]">{diff.materials.summary}</div>
            <div className="space-y-1.5 pt-1">
              {diff.materials.changed.map((m, i) => (
                <div key={i} className="p-2 rounded bg-[#181c24] space-y-1">
                  <div className="font-semibold text-amber-400 text-[11px]">{m.name}</div>
                  {Object.entries(m.changes).map(([k, v]) => (
                    <div key={k} className="text-[10px] font-mono text-gray-400">
                      <span className="text-gray-300 font-semibold">{k}:</span>{" "}
                      <span className="text-red-400 line-through">{JSON.stringify(v.old)}</span> →{" "}
                      <span className="text-emerald-400">{JSON.stringify(v.new)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Hierarchy Section */}
        <div className="bg-[#202632] border border-[#293040] rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-white/[0.02] border-b border-[#293040] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-200">
              <GitFork className="w-3.5 h-3.5 text-emerald-400" /> Hierarchy & Transforms
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0b0d10] text-gray-400">
              {diff.hierarchy.moved.length + diff.hierarchy.added.length + diff.hierarchy.removed.length} items
            </span>
          </div>
          <div className="p-3 text-xs space-y-2">
            <div className="text-gray-400 text-[11px]">{diff.hierarchy.summary}</div>
            <div className="space-y-1.5 pt-1">
              {diff.hierarchy.moved.map((n, i) => (
                <div key={i} className="p-2 rounded bg-[#181c24] space-y-1">
                  <div className="font-semibold text-gray-200 text-[11px]">{n.name} (Moved)</div>
                  {n.old_translation && (
                    <div className="text-[10px] font-mono text-gray-400">
                      Pos: <span className="text-red-400 line-through">{JSON.stringify(n.old_translation)}</span> →{" "}
                      <span className="text-emerald-400">{JSON.stringify(n.new_translation)}</span>
                    </div>
                  )}
                </div>
              ))}
              {diff.hierarchy.moved.length === 0 && diff.hierarchy.added.length === 0 && diff.hierarchy.removed.length === 0 && (
                <div className="text-gray-500 text-[11px]">No transform or node hierarchy changes.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
