'use client';

import React, { useState } from "react";
import { Project, AssetVersion, DiffResult } from "@/types";
import { Plus, Upload, ChevronRight, Folder, RefreshCw, Zap } from "lucide-react";

interface SidebarProps {
  projects: Project[];
  activeProject: Project | null;
  versions: AssetVersion[];
  selectedVersions: [string | null, string | null];
  diffHistory: DiffResult[];
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string) => void;
  onUploadFile: (file: File) => void;
  onToggleVersionSelection: (versionId: string) => void;
  onRunDiff: (epsilon: number) => void;
  onLoadCachedDiff: (diff: DiffResult) => void;
  onRefresh: () => void;
  isDiffing: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  activeProject,
  versions,
  selectedVersions,
  diffHistory,
  onSelectProject,
  onCreateProject,
  onUploadFile,
  onToggleVersionSelection,
  onRunDiff,
  onLoadCachedDiff,
  onRefresh,
  isDiffing,
}) => {
  const [newProjectName, setNewProjectName] = useState("");
  const [activeTab, setActiveTab] = useState<"projects" | "history">("projects");
  const [epsilon, setEpsilon] = useState(0.0001);
  const [isDragging, setIsDragging] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName.trim());
    setNewProjectName("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      onUploadFile(e.dataTransfer.files[0]);
    }
  };

  const [versionA, versionB] = selectedVersions;
  const canDiff = Boolean(versionA && versionB);

  return (
    <div className="w-[340px] bg-white border-r border-[#e2e8f0] flex flex-col h-full flex-shrink-0">
      {/* Header / Creation */}
      <div className="p-3.5 border-b border-[#e2e8f0]">
        <form onSubmit={handleCreate} className="flex gap-1.5 mb-2.5">
          <input
            type="text"
            placeholder="New project name..."
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] transition-colors"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </form>

        <div className="flex bg-[#f8fafc] p-0.5 rounded-lg border border-[#e2e8f0]">
          <button
            onClick={() => setActiveTab("projects")}
            className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-colors ${
              activeTab === "projects" ? "bg-white text-[#2563eb] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]"
            }`}
          >
            Projects & Files
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-colors ${
              activeTab === "history" ? "bg-white text-[#2563eb] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]"
            }`}
          >
            Diff History ({diffHistory.length})
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {activeTab === "projects" ? (
          <>
            {/* Project List */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
                <span>Projects</span>
                <button onClick={onRefresh} className="hover:text-[#2563eb] transition-colors">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1.5">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => onSelectProject(p)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                      activeProject?.id === p.id
                        ? "bg-[#eff6ff] border-[#2563eb] text-[#0f172a]"
                        : "bg-[#f8fafc] border-[#e2e8f0] text-[#334155] hover:bg-[#f1f5f9]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-[#2563eb]" />
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-[10px] text-[#94a3b8]">{new Date(p.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[#94a3b8]" />
                  </div>
                ))}
              </div>
            </div>

            {/* Version Management */}
            {activeProject && (
              <div className="pt-2 border-t border-[#e2e8f0] space-y-3">
                {/* Upload Dropzone */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
                    Upload 3D Asset
                  </div>
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-4 text-center block cursor-pointer transition-colors ${
                      isDragging ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e2e8f0] bg-[#f8fafc] hover:border-[#93c5fd]"
                    }`}
                  >
                    <Upload className="w-6 h-6 text-[#94a3b8] mx-auto mb-1.5" />
                    <div className="text-xs font-semibold text-[#334155]">Drop .glb or .gltf file here</div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">or click to browse</div>
                    <input
                      type="file"
                      accept=".glb,.gltf"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && onUploadFile(e.target.files[0])}
                    />
                  </label>
                </div>

                {/* Version List */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
                    <span>Versions ({versions.length})</span>
                    <span className="text-[10px] text-[#94a3b8] normal-case">Select 2 to diff</span>
                  </div>
                  <div className="space-y-1.5">
                    {versions.map((v) => {
                      const isA = versionA === v.id;
                      const isB = versionB === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => onToggleVersionSelection(v.id)}
                          className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                            isA
                              ? "border-amber-400 bg-amber-50 text-[#0f172a]"
                              : isB
                              ? "border-cyan-400 bg-cyan-50 text-[#0f172a]"
                              : "bg-[#f8fafc] border-[#e2e8f0] text-[#334155] hover:bg-[#f1f5f9]"
                          }`}
                        >
                          <div className="min-w-0 flex-1 mr-2">
                            <div className="font-semibold truncate">{v.filename}</div>
                            <div className="text-[10px] text-[#94a3b8]">
                              {new Date(v.uploaded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} •{" "}
                              {v.is_extracted ? "✓ Extracted" : "Extracting..."}
                            </div>
                          </div>
                          {isA && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-[#3f2d00] uppercase">
                              Base (A)
                            </span>
                          )}
                          {isB && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-400 text-[#00323f] uppercase">
                              Target (B)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Diff Launch Box */}
                <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-[#334155]">
                    <span>Epsilon Threshold</span>
                    <input
                      type="number"
                      value={epsilon}
                      step="0.0001"
                      onChange={(e) => setEpsilon(parseFloat(e.target.value) || 0.0001)}
                      className="w-20 bg-white border border-[#e2e8f0] rounded px-2 py-1 text-xs text-right outline-none focus:border-[#2563eb]"
                    />
                  </div>
                  <button
                    onClick={() => onRunDiff(epsilon)}
                    disabled={!canDiff || isDiffing}
                    className="w-full py-2 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Zap className="w-4 h-4" />
                    {isDiffing
                      ? "Computing Diff..."
                      : canDiff
                      ? "Compute 3D Diff (A vs B)"
                      : "Select 2 Versions to Diff"}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* History Tab */
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
              Saved Diff Cache
            </div>
            <div className="space-y-1.5">
              {diffHistory.length === 0 ? (
                <div className="text-xs text-[#94a3b8] py-4 text-center">No cached diffs for this project.</div>
              ) : (
                diffHistory.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => onLoadCachedDiff(d)}
                    className="p-2.5 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] hover:bg-[#f1f5f9] cursor-pointer text-xs flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-[#0f172a]">
                        {d.geometry_exact ? "✓ Exact Match" : "≈ Approx Match"}
                      </div>
                      <div className="text-[10px] text-[#94a3b8]">
                        {new Date(d.computed_at).toLocaleString()} · ε={d.epsilon}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                      Load
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
