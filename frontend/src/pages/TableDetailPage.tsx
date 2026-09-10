import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Zap, Trash2, ChevronDown } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { AuditResults } from "../components/AuditResults";
import { deleteTable, fetchHistory, fetchPlans, fetchTable, runAudit } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AuditRunOut, PlanLimits, TableDetail } from "../types";

export const TableDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [result, setResult] = useState<AuditRunOut | null>(null);
  const [history, setHistory] = useState<AuditRunOut[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    Promise.all([fetchTable(id), fetchPlans(), fetchHistory(id)])
      .then(([t, plans, hist]) => {
        setDetail(t);
        if (user) setLimits(plans[user.plan]);
        setHistory(hist);
        if (hist.length > 0) setResult(hist[0]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load table"))
      .finally(() => setIsLoading(false));
  }, [id, user]);

  const handleRunAudit = async () => {
    if (!id) return;
    setIsRunning(true);
    setError(null);
    try {
      const res = await runAudit(id);
      setResult(res);
      const hist = await fetchHistory(id);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setIsRunning(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm("Delete this loot table and all its audit history?")) return;
    await deleteTable(id);
    navigate("/dashboard");
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="text-ink-muted text-sm py-16 text-center">Loading...</div>
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell>
        <div className="text-danger text-sm py-16 text-center">{error || "Table not found."}</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.5px] text-ink">{detail.name}</h1>
            <p className="text-[14px] font-mono text-ink-muted mt-1.5">{detail.table.table_id}</p>
          </div>
          <button
            onClick={handleDelete}
            className="text-ink-muted hover:text-danger transition-colors cursor-pointer p-2"
            title="Delete table"
          >
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 mb-8">
          <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-muted bg-bg border border-line rounded-full px-3 py-1">
            {detail.table.items.length} items
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-muted bg-bg border border-line rounded-full px-3 py-1">
            {detail.table.pity ? `Pity: ${detail.table.pity.target_rarity}` : "No pity rule"}
          </span>
          {limits && (
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-muted bg-bg border border-line rounded-full px-3 py-1">
              Up to {limits.max_pulls.toLocaleString()} pulls per audit &middot; {user?.plan} plan
            </span>
          )}
        </div>

        <Card className="p-6 mb-6">
          <Button onClick={handleRunAudit} disabled={isRunning}>
            <Zap className="w-4 h-4" /> {isRunning ? "Running audit..." : "Run Audit"}
          </Button>
          {error && <div className="mt-3 text-[13px] text-danger bg-danger-soft rounded-md px-3 py-2">{error}</div>}
        </Card>

        {result && (
          <Card className="p-6 mb-6">
            <AuditResults result={result} table={detail.table} canExport={limits?.export ?? false} />
            {!limits?.export && (
              <p className="text-[12px] text-ink-muted mt-4 pt-4 border-t border-line">
                Report export is available on the Studio and Enterprise plans.
              </p>
            )}
          </Card>
        )}

        {!result && !isRunning && (
          <Card className="p-10 text-center text-[13.5px] text-ink-muted">
            No audit run yet. Click <b>Run Audit</b> above to validate and simulate this table.
          </Card>
        )}

        {history.length > 1 && (
          <div>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink cursor-pointer mb-3"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              {limits?.full_history
                ? `History (${history.length} runs)`
                : "Full history requires the Studio or Enterprise plan"}
            </button>
            {showHistory && limits?.full_history && (
              <div className="flex flex-col gap-2">
                {history.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setResult(run)}
                    className={`text-left rounded-md border px-3.5 py-2.5 text-[13px] cursor-pointer transition-colors ${
                      result?.id === run.id ? "border-accent bg-accent-soft" : "border-line hover:bg-bg"
                    }`}
                  >
                    {new Date(run.created_at).toLocaleString()} --{" "}
                    {run.blocked ? "blocked" : run.compliance?.overall_status ?? "unknown"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
};
