import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusDot } from "../components/ui/Badge";
import { deleteTable, fetchPlans, fetchTables } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { PlanLimits, TableSummary } from "../types";

const STATUS_TONE: Record<string, "green" | "yellow" | "red" | "neutral"> = {
  green: "green",
  yellow: "yellow",
  red: "red",
  blocked: "red",
};

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => {
    setIsLoading(true);
    Promise.all([fetchTables(), fetchPlans()])
      .then(([t, plans]) => {
        setTables(t);
        if (user) setLimits(plans[user.plan]);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [user]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this loot table and all its audit history?")) return;
    await deleteTable(id);
    load();
  };

  const atLimit = limits?.max_tables !== null && limits !== null && tables.length >= (limits?.max_tables ?? Infinity);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">Your Loot Tables</h1>
            {limits && (
              <p className="text-[13.5px] text-ink-muted mt-1">
                {tables.length} of {limits.max_tables ?? "unlimited"} saved -- {user?.plan} plan (
                {limits.max_pulls.toLocaleString()} pulls per audit)
              </p>
            )}
          </div>
          <Link to="/tables/new">
            <Button disabled={atLimit} title={atLimit ? "Upgrade your plan to save more tables" : undefined}>
              <Plus className="w-4 h-4" /> New Audit
            </Button>
          </Link>
        </div>

        {atLimit && (
          <Card className="p-4 mb-6 bg-accent-soft">
            <p className="text-[13.5px] text-ink">
              You've reached your {user?.plan} plan's saved-table limit.{" "}
              <Link to="/pricing" className="text-accent font-medium hover:underline">
                Upgrade
              </Link>{" "}
              to save more.
            </p>
          </Card>
        )}

        {isLoading ? (
          <div className="text-ink-muted text-sm py-16 text-center">Loading...</div>
        ) : tables.length === 0 ? (
          <Card className="p-14 text-center">
            <p className="text-[15px] text-ink-muted mb-4">No loot tables yet.</p>
            <Link to="/tables/new">
              <Button>
                <Plus className="w-4 h-4" /> Create your first audit
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tables.map((t) => (
              <Card
                key={t.id}
                className="p-5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)] group"
                onClick={() => navigate(`/tables/${t.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {t.last_status && <StatusDot tone={STATUS_TONE[t.last_status] ?? "neutral"} />}
                      <h3 className="text-[15px] font-medium truncate">{t.name}</h3>
                    </div>
                    <p className="text-[12px] text-ink-muted mt-1 font-mono truncate">{t.table_id}</p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(t.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-danger transition-opacity shrink-0 cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11.5px] text-ink-muted mt-4">
                  Updated {new Date(t.updated_at).toLocaleDateString()}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};
