import type { AuditResponse, LootTable } from "../types";

const getApiBase = () => {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname || "localhost"}:8000`;
  }
  return "http://localhost:8000";
};

export async function fetchSamples(): Promise<Record<string, LootTable>> {
  const res = await fetch(`${getApiBase()}/samples`);
  if (!res.ok) throw new Error("Failed to fetch sample tables");
  return res.json();
}

export async function runAudit(
  table: LootTable,
  opts: { num_pulls?: number; tolerance?: number; seed?: number } = {}
): Promise<AuditResponse> {
  const res = await fetch(`${getApiBase()}/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, ...opts }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}
