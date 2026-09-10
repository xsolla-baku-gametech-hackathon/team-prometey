'use client';

import React, { useState } from "react";
import { Project, AssetVersion, DiffResult } from "@/types";
import { Plus, Upload, Clock, CheckCircle2, ChevronRight, Folder, RefreshCw, Zap } from "lucide-react";

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
    <div className="w-[340px] bg-[#13161c] border-r border-[#293040] flex flex-col h-full flex-shrink-0">
      {/* Header / Creation */}
      <div className="p-3.5 border-b border-[#293040]">
        <form onSubmit={handleCreate} className="flex gap-1.5 mb-2.5">
          <input
            type="text"
            placeholder="New project name..."
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className="flex-1 bg-[#202632] border border-[#293040] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500 transition-all"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </form>

        <div className="flex bg-[#0b0d10] p-0.5 rounded-lg">
          <button
            onClick={() => setActiveTab("projects")}
            className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${
              activeTab === "projects" ? "bg-[#202632] text-white shadow-sm" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Projects & Files
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${
              activeTab === "history" ? "bg-[#202632] text-white shadow-sm" : "text-gray-400 hover:text-gray-200"
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
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                <span>Projects</span>
                <button onClick={onRefresh} className="hover:text-blue-400 transition-colors">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1.5">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => onSelectProject(p)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-all ${
                      activeProject?.id === p.id
                        ? "bg-[#1c273e] border-blue-500 text-white shadow-sm"
                        : "bg-[#202632] border-[#293040] text-gray-300 hover:bg-[#28303f]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-[10px] text-gray-500">{new Date(p.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                ))}
              </div>
            </div>

            {/* Version Management */}
            {activeProject && (
              <div className="pt-2 border-t border-[#293040]/60 space-y-3">
                {/* Upload Dropzone */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                    Upload 3D Asset
                  </div>
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-4 text-center block cursor-pointer transition-all ${
                      isDragging
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-[#293040] bg-[#181c24]/50 hover:border-blue-500/50"
                    }`}
                  >
                    <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1.5" />
                    <div className="text-xs font-semibold text-gray-300">Drop .glb or .gltf file here</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">or click to browse</div>
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
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                    <span>Versions ({versions.length})</span>
                    <span className="text-[10px] text-gray-500 normal-case">Select 2 to diff</span>
                  </div>
                  <div className="space-y-1.5">
                    {versions.map((v) => {
                      const isA = versionA === v.id;
                      const isB = versionB === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => onToggleVersionSelection(v.id)}
                          className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-all ${
                            isA
                              ? "border-amber-500 bg-amber-500/10 text-white"
                              : isB
                              ? "border-cyan-500 bg-cyan-500/10 text-white"
                              : "bg-[#202632] border-[#293040] text-gray-300 hover:bg-[#28303f]"
                          }`}
                        >
                          <div className="min-w-0 flex-1 mr-2">
                            <div className="font-semibold truncate">{v.filename}</div>
                            <div className="text-[10px] text-gray-500">
                              {new Date(v.uploaded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} •{" "}
                              {v.is_extracted ? "✓ Extracted" : "Extracting..."}
                            </div>
                          </div>
                          {isA && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-black uppercase">
                              Base (A)
                            </span>
                          )}
                          {isB && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500 text-black uppercase">
                              Target (B)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Diff Launch Box */}
                <div className="bg-[#202632] border border-[#293040] rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-gray-300">
                    <span>Epsilon Threshold</span>
                    <input
                      type="number"
                      value={epsilon}
                      step="0.0001"
                      onChange={(e) => setEpsilon(parseFloat(e.target.value) || 0.0001)}
                      className="w-20 bg-[#13161c] border border-[#293040] rounded px-2 py-1 text-xs text-right outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => onRunDiff(epsilon)}
                    disabled={!canDiff || isDiffing}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
                  >
                    <Zap className="w-4 h-4" />
                    {isDiffing
                      ? "Computing Diff..."
                      : canDiff
                      ? "⚡ Compute 3D Diff (A vs B)"
                      : "Select 2 Versions to Diff"}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* History Tab */
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              Saved Diff Cache
            </div>
            <div className="space-y-1.5">
              {diffHistory.length === 0 ? (
                <div className="text-xs text-gray-500 py-4 text-center">No cached diffs for this project.</div>
              ) : (
                diffHistory.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => onLoadCachedDiff(d)}
                    className="p-2.5 rounded-lg bg-[#202632] border border-[#293040] hover:bg-[#28303f] cursor-pointer text-xs flex items-center justify-between transition-all"
                  >
                    <div>
                      <div className="font-semibold text-gray-200">
                        {d.geometry_exact ? "✓ Exact Match" : "≈ Approx Match"}
                      </div>
                      <div className="text-[10px] text-gray-500">{new Date(d.computed_at).toLocaleString()}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
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
