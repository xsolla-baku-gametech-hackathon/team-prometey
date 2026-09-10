import { Project, AssetVersion, DiffResult } from "@/types";

const getApiBase = () => {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname || "localhost"}:8000`;
  }
  return "http://localhost:8000";
};

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${getApiBase()}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createProject(name: string): Promise<Project> {
  const formData = new FormData();
  formData.append("name", name);
  const res = await fetch(`${getApiBase()}/projects`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create project" }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function fetchProject(projectId: string): Promise<Project & { versions: AssetVersion[] }> {
  const res = await fetch(`${getApiBase()}/projects/${projectId}`);
  if (!res.ok) throw new Error("Failed to fetch project details");
  return res.json();
}

export async function uploadVersion(projectId: string, file: File): Promise<AssetVersion> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${getApiBase()}/projects/${projectId}/versions`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function computeDiff(versionAId: string, versionBId: string, epsilon = 0.0001): Promise<DiffResult> {
  const formData = new FormData();
  formData.append("version_a_id", versionAId);
  formData.append("version_b_id", versionBId);
  formData.append("epsilon", epsilon.toString());
  const res = await fetch(`${getApiBase()}/diffs`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to compute diff" }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function fetchProjectDiffs(projectId: string): Promise<DiffResult[]> {
  const res = await fetch(`${getApiBase()}/projects/${projectId}/diffs`);
  if (!res.ok) throw new Error("Failed to fetch project diffs");
  return res.json();
}

export function getModelFileUrl(versionId: string): string {
  return `${getApiBase()}/versions/${versionId}/file`;
}
