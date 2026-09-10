import React, { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import type { AuditRunOut, FlagStatus } from "../types";

const STATUS_TONE: Record<string, "green" | "yellow" | "red"> = { green: "green", yellow: "yellow", red: "red" };

function runLabel(run: AuditRunOut): string {
  const status = run.blocked ? "blocked" : (run.compliance?.overall_status ?? "unknown");
  return `${new Date(run.created_at).toLocaleString()} -- ${status}`;
}

/** Side-by-side diff between two saved audit runs for the same table -- lets a user see whether an edit actually moved compliance, not just re-run and eyeball two separate screens. */
export const CompareRuns: React.FC<{ runs: AuditRunOut[] }> = ({ runs }) => {
  // Default to comparing the two most recent runs -- b (newer) vs. a (older).
  const [idA, setIdA] = useState(runs[1]?.id ?? runs[0]?.id ?? "");
  const [idB, setIdB] = useState(runs[0]?.id ?? "");

  const runA = runs.find((r) => r.id === idA);
  const runB = runs.find((r) => r.id === idB);

  const itemIds = Array.from(
    new Set([
      ...(runA?.compliance?.item_flags.map((f) => f.item_id) ?? []),
      ...(runB?.compliance?.item_flags.map((f) => f.item_id) ?? []),
    ])
  );

  const flagFor = (run: AuditRunOut | undefined, itemId: string) =>
    run?.compliance?.item_flags.find((f) => f.item_id === itemId);

  const overallA = runA ? (runA.blocked ? "blocked" : (runA.compliance?.overall_status ?? "unknown")) : "--";
  const overallB = runB ? (runB.blocked ? "blocked" : (runB.compliance?.overall_status ?? "unknown")) : "--";

  return (
    <Card className="p-6 mb-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-3">Compare Runs</div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={idA}
          onChange={(e) => setIdA(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-accent max-w-[280px]"
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {runLabel(r)}
            </option>
          ))}
        </select>
        <ArrowRight className="w-4 h-4 text-ink-muted shrink-0" />
        <select
          value={idB}
          onChange={(e) => setIdB(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-accent max-w-[280px]"
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {runLabel(r)}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[13px]">
          <Badge tone={STATUS_TONE[overallA] ?? "neutral"} solid>
            {overallA}
          </Badge>
          <ArrowRight className="w-3.5 h-3.5 text-ink-muted" />
          <Badge tone={STATUS_TONE[overallB] ?? "neutral"} solid>
            {overallB}
          </Badge>
        </div>
      </div>

      {itemIds.length === 0 ? (
        <p className="text-[13px] text-ink-muted">One or both runs has no compliance data to compare (blocked or not yet simulated).</p>
      ) : (
        <div className="border border-line rounded-lg overflow-hidden">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="bg-bg text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                <th className="text-left px-3.5 py-2.5">Item</th>
                <th className="text-left px-3.5 py-2.5">Rate A</th>
                <th className="text-left px-3.5 py-2.5">Rate B</th>
                <th className="text-left px-3.5 py-2.5">Change</th>
                <th className="text-left px-3.5 py-2.5">Status A</th>
                <th className="text-left px-3.5 py-2.5">Status B</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {itemIds.map((id) => {
                const fa = flagFor(runA, id);
                const fb = flagFor(runB, id);
                const delta = fa && fb ? fb.simulated_rate - fa.simulated_rate : null;
                const statusChanged = fa && fb && fa.status !== fb.status;
                return (
                  <tr key={id} className={statusChanged ? "bg-accent-soft/40" : undefined}>
                    <td className="px-3.5 py-2.5 font-medium">{id}</td>
                    <td className="px-3.5 py-2.5 text-ink-muted">{fa ? `${(fa.simulated_rate * 100).toFixed(2)}%` : "--"}</td>
                    <td className="px-3.5 py-2.5 text-ink-muted">{fb ? `${(fb.simulated_rate * 100).toFixed(2)}%` : "--"}</td>
                    <td className={`px-3.5 py-2.5 ${delta !== null && delta > 0 ? "text-success" : delta !== null && delta < 0 ? "text-danger" : "text-ink-muted"}`}>
                      {delta !== null ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(3)} pp` : "--"}
                    </td>
                    <td className="px-3.5 py-2.5">{fa ? <Badge tone={STATUS_TONE[fa.status as FlagStatus]} solid>{fa.status}</Badge> : "--"}</td>
                    <td className="px-3.5 py-2.5">{fb ? <Badge tone={STATUS_TONE[fb.status as FlagStatus]} solid>{fb.status}</Badge> : "--"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
