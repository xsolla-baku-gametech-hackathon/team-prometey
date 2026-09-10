'use client';

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ThreeViewport } from "@/components/ThreeViewport";
import { ChangelogPanel } from "@/components/ChangelogPanel";
import { Project, AssetVersion, DiffResult } from "@/types";
import { fetchProjects, createProject, fetchProject, uploadVersion, computeDiff, fetchProjectDiffs } from "@/lib/api";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<[string | null, string | null]>([null, null]);
  const [diffHistory, setDiffHistory] = useState<DiffResult[]>([]);
  const [currentDiffResult, setCurrentDiffResult] = useState<DiffResult | null>(null);
  const [highlightRequest, setHighlightRequest] = useState<{ name: string; nonce: number } | null>(null);

  const [status, setStatus] = useState("Ready");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDiffing, setIsDiffing] = useState(false);

  // Load Projects on Start
  useEffect(() => {
    loadProjectsList();
  }, []);

  const loadProjectsList = async () => {
    try {
      setIsLoading(true);
      setStatus("Loading projects...");
      const list = await fetchProjects();
      setProjects(list);
      setIsLoading(false);
      setStatus("Ready");
    } catch (err: any) {
      setIsError(true);
      setStatus(err.message || "Failed to load projects");
    }
  };

  const handleSelectProject = async (project: Project) => {
    try {
      setActiveProject(project);
      setSelectedVersions([null, null]);
      setCurrentDiffResult(null);
      setIsLoading(true);
      setStatus(`Loading ${project.name}...`);

      const [detail, diffs] = await Promise.all([
        fetchProject(project.id),
        fetchProjectDiffs(project.id).catch(() => []),
      ]);

      setVersions(detail.versions || []);
      setDiffHistory(diffs);
      setIsLoading(false);
      setStatus(`Project: ${project.name}`);
    } catch (err: any) {
      setIsError(true);
      setStatus(err.message || "Error loading project");
    }
  };

  const handleCreateProject = async (name: string) => {
    try {
      setIsLoading(true);
      setStatus("Creating project...");
      const project = await createProject(name);
      await loadProjectsList();
      await handleSelectProject(project);
    } catch (err: any) {
      setIsError(true);
      setStatus(err.message || "Error creating project");
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!activeProject) return;
    try {
      setIsLoading(true);
      setStatus(`Uploading & extracting ${file.name}...`);
      await uploadVersion(activeProject.id, file);
      const detail = await fetchProject(activeProject.id);
      setVersions(detail.versions || []);
      setIsLoading(false);
      setStatus(`Extracted ${file.name}`);
    } catch (err: any) {
      setIsError(true);
      setStatus(err.message || "Upload failed");
    }
  };

  const handleToggleVersionSelection = (id: string) => {
    const [vA, vB] = selectedVersions;
    if (vA === id) {
      setSelectedVersions([vB, null]);
    } else if (vB === id) {
      setSelectedVersions([vA, null]);
    } else if (!vA) {
      setSelectedVersions([id, null]);
    } else if (!vB) {
      setSelectedVersions([vA, id]);
    } else {
      setSelectedVersions([vA, id]);
    }
  };

  const handleRunDiff = async (epsilon: number) => {
    const [vA, vB] = selectedVersions;
    if (!vA || !vB || !activeProject) return;

    try {
      setIsDiffing(true);
      setStatus("Computing mesh diff...");
      const res = await computeDiff(vA, vB, epsilon);
      setCurrentDiffResult(res);
      setIsDiffing(false);
      setStatus("Diff complete!");

      const diffs = await fetchProjectDiffs(activeProject.id);
      setDiffHistory(diffs);
    } catch (err: any) {
      setIsDiffing(false);
      setIsError(true);
      setStatus(err.message || "Diff failed");
    }
  };

  const handleLoadCachedDiff = (diff: DiffResult) => {
    setSelectedVersions([diff.version_a_id, diff.version_b_id]);
    setCurrentDiffResult(diff);
    setStatus("Loaded cached diff");
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0d10]">
      <Header status={status} isError={isError} isLoading={isLoading || isDiffing} />
      <div className="flex flex-1 min-h-0 relative">
        <Sidebar
          projects={projects}
          activeProject={activeProject}
          versions={versions}
          selectedVersions={selectedVersions}
          diffHistory={diffHistory}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onUploadFile={handleUploadFile}
          onToggleVersionSelection={handleToggleVersionSelection}
          onRunDiff={handleRunDiff}
          onLoadCachedDiff={handleLoadCachedDiff}
          onRefresh={loadProjectsList}
          isDiffing={isDiffing}
        />
        <ThreeViewport
          versionAId={selectedVersions[0]}
          versionBId={selectedVersions[1]}
          diffPayload={currentDiffResult?.diff || null}
          highlightRequest={highlightRequest}
        />
        <ChangelogPanel
          diffResult={currentDiffResult}
          onMeshClick={(name) => setHighlightRequest({ name, nonce: Date.now() })}
        />
      </div>
    </div>
  );
}
