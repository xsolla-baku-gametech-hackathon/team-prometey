import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { AuditResults } from "../components/AuditResults";
import { CompareRuns } from "../components/CompareRuns";
import { DriftAnalysis } from "../components/DriftAnalysis";
import { fetchHistory, fetchPlans, fetchTable } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AuditRunOut, PlanLimits, TableDetail } from "../types";

const STATUS_TONE: Record<string, "green" | "yellow" | "red"> = { green: "green", yellow: "yellow", red: "red" };

function statusOf(run: AuditRunOut): string {
  return run.blocked ? "blocked" : (run.compliance?.overall_status ?? "unknown");
}

function issueCountOf(run: AuditRunOut): number {
  const validationIssues = run.validation_issues.length;
  const outOfTolerance = run.compliance?.item_flags.filter((f) => f.status !== "green").length ?? 0;
  const pityIssue = run.compliance?.pity_flag?.status === "red" ? 1 : 0;
  return validationIssues + outOfTolerance + pityIssue;
}

/** Dedicated audit-history page for a table -- past runs, drill into any one, and compare two. */
export const TableHistoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [history, setHistory] = useState<AuditRunOut[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
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
        if (hist.length > 0) setExpandedId(hist[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load audit history"))
      .finally(() => setIsLoading(false));
  }, [id, user]);

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
        <Link to={`/tables/${id}`} className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink mb-4">
          <ChevronLeft className="w-4 h-4" /> Back to {detail.name}
        </Link>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Audit History</h1>
          {limits?.full_history && history.length > 1 && (
            <button
              onClick={() => setShowCompare((v) => !v)}
              className={`text-[13.5px] font-medium cursor-pointer ${showCompare ? "text-accent" : "text-ink-muted hover:text-ink"}`}
            >
              {showCompare ? "Hide compare" : "Compare runs"}
            </button>
          )}
        </div>
        <p className="text-[13.5px] text-ink-muted mb-8">
          {history.length} audit run{history.length === 1 ? "" : "s"} for {detail.name}
        </p>

        {!limits?.full_history && (
          <Card className="p-4 mb-6 bg-accent-soft border-accent/20">
            <p className="text-[13.5px] text-ink">
              Your {user?.plan} plan keeps the latest run only.{" "}
              <Link to="/pricing" className="text-accent font-medium hover:underline">
                Upgrade to Studio or Enterprise
              </Link>{" "}
              for full audit history.
            </p>
          </Card>
        )}

        {showCompare && limits?.full_history && history.length > 1 && (
          <div className="mb-6">
            <CompareRuns runs={history} />
          </div>
        )}

        {limits?.full_history && <DriftAnalysis history={history} />}

        {history.length === 0 ? (
          <Card className="p-10 text-center text-[13.5px] text-ink-muted">
            No audit runs yet. Go back to the table and click <b>Run Audit</b>.
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((run) => {
              const isExpanded = expandedId === run.id;
              const status = statusOf(run);
              const issues = issueCountOf(run);
              return (
                <Card key={run.id} className="overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : run.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left cursor-pointer hover:bg-bg transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 shrink-0 text-ink-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-ink">{new Date(run.created_at).toLocaleString()}</div>
                      <div className="text-[12.5px] text-ink-muted mt-0.5">
                        {run.simulation ? `${run.simulation.num_pulls.toLocaleString()} pulls -- ` : ""}
                        {issues} issue{issues === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[status] ?? "neutral"} solid>
                      {status}
                    </Badge>
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-1 border-t border-line">
                      <AuditResults result={run} table={detail.table} canExport={limits?.export ?? false} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
};
