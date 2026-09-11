import type {
  AdminUser,
  AuditRunOut,
  AuthResponse,
  LootTable,
  Plan,
  PlanLimits,
  TableDetail,
  TableSummary,
  User,
} from "../types";

const getApiBase = () => {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname || "localhost"}:8000`;
  }
  return "http://localhost:8000";
};

const TOKEN_KEY = "loot_auditor_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as Record<string, string>) };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${getApiBase()}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Public ───────────────────────────────────────────────────────────────

export function fetchSamples(): Promise<Record<string, LootTable>> {
  return request("/samples", {}, false);
}

export function fetchPlans(): Promise<Record<Plan, PlanLimits>> {
  return request("/plans", {}, false);
}

// ── Auth ─────────────────────────────────────────────────────────────────

export function signup(email: string, password: string): Promise<AuthResponse> {
  return request("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }, false);
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false);
}

export function fetchMe(): Promise<User> {
  return request("/user/me");
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request("/user/password", {
    method: "PUT",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// ── Loot tables ──────────────────────────────────────────────────────────

export function fetchTables(): Promise<TableSummary[]> {
  return request("/tables");
}

export function createTable(name: string, table: LootTable): Promise<TableDetail> {
  return request("/tables", { method: "POST", body: JSON.stringify({ name, table }) });
}

export function fetchTable(id: string): Promise<TableDetail> {
  return request(`/tables/${id}`);
}

export function updateTable(id: string, name: string, table: LootTable): Promise<TableDetail> {
  return request(`/tables/${id}`, { method: "PUT", body: JSON.stringify({ name, table }) });
}

export function deleteTable(id: string): Promise<void> {
  return request(`/tables/${id}`, { method: "DELETE" });
}

// ── Audit ────────────────────────────────────────────────────────────────

export function runAudit(
  tableId: string,
  opts: { num_pulls?: number; tolerance?: number; seed?: number } = {}
): Promise<AuditRunOut> {
  return request(`/tables/${tableId}/audit`, { method: "POST", body: JSON.stringify(opts) });
}

export function fetchHistory(tableId: string): Promise<AuditRunOut[]> {
  return request(`/tables/${tableId}/history`);
}

// ── Admin ────────────────────────────────────────────────────────────────

export function fetchAdminUsers(): Promise<AdminUser[]> {
  return request("/admin/users");
}

export function updateUserPlan(userId: string, plan: Plan): Promise<AdminUser> {
  return request(`/admin/users/${userId}/plan`, { method: "PATCH", body: JSON.stringify({ plan }) });
}
