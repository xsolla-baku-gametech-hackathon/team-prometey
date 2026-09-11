import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { fetchAdminUsers, updateUserPlan } from "../lib/api";
import type { AdminUser, Plan } from "../types";

const PLANS: Plan[] = ["free", "studio", "enterprise"];

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    fetchAdminUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  const stats = useMemo(() => {
    const byPlan: Record<Plan, number> = { free: 0, studio: 0, enterprise: 0 };
    let tables = 0;
    for (const u of users) {
      byPlan[u.plan] += 1;
      tables += u.table_count;
    }
    return { total: users.length, byPlan, tables };
  }, [users]);

  const filtered = users.filter((u) => u.email.toLowerCase().includes(search.trim().toLowerCase()));

  const handlePlanChange = async (userId: string, plan: Plan) => {
    setPendingId(userId);
    setError(null);
    try {
      const updated = await updateUserPlan(userId, plan);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update plan");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center gap-2.5 mb-1">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <h1 className="text-[26px] font-semibold tracking-tight">Admin</h1>
        </div>
        <p className="text-[13.5px] text-ink-muted mb-8">
          Monitor accounts and change a user's plan -- this is how a sales-assisted upgrade actually takes effect,
          since there's no payment processor wired up yet.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-1.5">Users</div>
            <div className="text-[24px] font-semibold tabular-nums">{stats.total}</div>
          </Card>
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-1.5">Free</div>
            <div className="text-[24px] font-semibold tabular-nums">{stats.byPlan.free}</div>
          </Card>
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-1.5">
              Studio + Enterprise
            </div>
            <div className="text-[24px] font-semibold tabular-nums">{stats.byPlan.studio + stats.byPlan.enterprise}</div>
          </Card>
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-1.5">
              Saved Tables
            </div>
            <div className="text-[24px] font-semibold tabular-nums">{stats.tables}</div>
          </Card>
        </div>

        <div className="flex items-center justify-between mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email..."
            className="w-64 rounded-md border border-line bg-surface px-3.5 py-2 text-[13.5px] outline-none focus:border-accent"
          />
          {error && <span className="text-[13px] text-danger">{error}</span>}
        </div>

        <Card className="p-0 overflow-hidden">
          {isLoading ? (
            <div className="text-ink-muted text-sm py-16 text-center">Loading...</div>
          ) : (
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="bg-bg text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                  <th className="text-left px-4 py-2.5">Email</th>
                  <th className="text-left px-4 py-2.5">Plan</th>
                  <th className="text-left px-4 py-2.5">Tables</th>
                  <th className="text-left px-4 py-2.5">Joined</th>
                  <th className="text-left px-4 py-2.5">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2.5 font-medium">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.plan}
                        disabled={pendingId === u.id}
                        onChange={(e) => handlePlanChange(u.id, e.target.value as Plan)}
                        className="rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] outline-none focus:border-accent capitalize disabled:opacity-50"
                      >
                        {PLANS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{u.table_count}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">{u.is_admin && <Badge tone="accent">Admin</Badge>}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                      No users match "{search}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
};
