// Mirrors backend/app/schema.py, simulate.py, compliance.py, validator.py.
// Field names are snake_case to match the API's JSON wire format exactly.

export interface Item {
  id: string;
  rarity: string;
  weight: number;
  ref_table_id?: string | null;
}

export interface Pity {
  target_rarity: string;
  guaranteed_within_pulls: number;
  reset_on_trigger: boolean;
}

export interface LootTable {
  table_id: string;
  advertised_rates: Record<string, number>;
  items: Item[];
  pity?: Pity | null;
}

export interface Issue {
  severity: "error" | "warning";
  code: string;
  message: string;
  item_id?: string | null;
}

export interface PityStats {
  target_rarity: string;
  guaranteed_within_pulls: number;
  natural_hits: number;
  forced_hits: number;
  max_pulls_observed_to_target: number | null;
  convergence_histogram: { range_start: number; range_end: number; count: number }[];
}

export interface SimulationResult {
  num_pulls: number;
  item_counts: Record<string, number>;
  item_rates: Record<string, number>;
  rarity_counts: Record<string, number>;
  rarity_rates: Record<string, number>;
  realized_item_counts: Record<string, number>;
  realized_item_rates: Record<string, number>;
  pity: PityStats | null;
}

export type FlagStatus = "green" | "yellow" | "red";

export interface ItemFlag {
  item_id: string;
  advertised_rate: number;
  simulated_rate: number;
  delta: number;
  effective_tolerance: number;
  status: FlagStatus;
}

export interface PityFlag {
  status: "green" | "red";
  message: string;
}

export interface ComplianceReport {
  tolerance: number;
  item_flags: ItemFlag[];
  pity_flag: PityFlag | null;
  overall_status: FlagStatus;
}

// AuditRunOut from the backend -- same shape as the old stateless
// AuditResponse plus persistence fields (id, created_at).
export interface AuditRunOut {
  id: string;
  validation_issues: Issue[];
  blocked: boolean;
  simulation: SimulationResult | null;
  compliance: ComplianceReport | null;
  created_at: string;
}

// ── Multi-user / SaaS shapes ────────────────────────────────────────────

export type Plan = "free" | "studio" | "enterprise";

export interface PlanLimits {
  max_tables: number | null;
  max_pulls: number;
  export: boolean;
  full_history: boolean;
}

export interface User {
  id: string;
  email: string;
  plan: Plan;
  is_admin: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  plan: Plan;
  is_admin: boolean;
  created_at: string;
  table_count: number;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export interface TableSummary {
  id: string;
  name: string;
  table_id: string;
  created_at: string;
  updated_at: string;
  last_status: FlagStatus | "blocked" | null;
}

export interface TableDetail {
  id: string;
  name: string;
  table: LootTable;
  created_at: string;
  updated_at: string;
}
