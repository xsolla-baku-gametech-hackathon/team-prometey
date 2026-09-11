import React, { useMemo } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import type { AuditRunOut } from "../types";

interface Point {
  runIndex: number;
  delta: number;
}

interface DriftRow {
  itemId: string;
  slopePerRun: number; // pp per audit run, signed
  latestDelta: number;
  floor: number;
  runsToBreach: number | null; // null = not trending toward the floor
  status: "drifting" | "improving" | "stable";
}

/** Ordinary least-squares slope of y on x -- the simplest real trend line, no library needed for two columns of numbers. */
function linearRegressionSlope(points: Point[]): number {
  const n = points.length;
  const xBar = points.reduce((s, p) => s + p.runIndex, 0) / n;
  const yBar = points.reduce((s, p) => s + p.delta, 0) / n;
  const num = points.reduce((s, p) => s + (p.runIndex - xBar) * (p.delta - yBar), 0);
  const den = points.reduce((s, p) => s + (p.runIndex - xBar) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

function computeDrift(history: AuditRunOut[]): DriftRow[] {
  // Oldest-first, non-blocked runs with compliance data.
  const chronological = [...history].filter((r) => !r.blocked && r.compliance).reverse();
  if (chronological.length < 3) return [];

  const itemIds = new Set<string>();
  for (const run of chronological) {
    for (const f of run.compliance!.item_flags) itemIds.add(f.item_id);
  }

  const rows: DriftRow[] = [];
  for (const itemId of itemIds) {
    const points: Point[] = [];
    let latestFloor = 0.001;
    chronological.forEach((run, i) => {
      const flag = run.compliance!.item_flags.find((f) => f.item_id === itemId);
      if (flag) {
        points.push({ runIndex: i, delta: flag.delta });
        latestFloor = flag.effective_tolerance;
      }
    });
    if (points.length < 3) continue;

    const slope = linearRegressionSlope(points);
    const latestDelta = points[points.length - 1].delta;
    const movingAwayFromZero = Math.sign(slope) === Math.sign(latestDelta) && slope !== 0;

    let runsToBreach: number | null = null;
    let status: DriftRow["status"] = "stable";
    if (movingAwayFromZero && Math.abs(latestDelta) < latestFloor) {
      runsToBreach = Math.max(1, Math.ceil((latestFloor - Math.abs(latestDelta)) / Math.abs(slope)));
      status = "drifting";
    } else if (movingAwayFromZero && Math.abs(latestDelta) >= latestFloor) {
      status = "drifting"; // already outside the floor and still moving further out
    } else if (Math.sign(slope) !== Math.sign(latestDelta) && slope !== 0) {
      status = "improving";
    }

    rows.push({ itemId, slopePerRun: slope, latestDelta, floor: latestFloor, runsToBreach, status });
  }

  return rows.sort((a, b) => Math.abs(b.slopePerRun) - Math.abs(a.slopePerRun));
}

const STATUS_META: Record<DriftRow["status"], { tone: "red" | "green" | "neutral"; label: string }> = {
  drifting: { tone: "red", label: "Drifting toward breach" },
  improving: { tone: "green", label: "Improving" },
  stable: { tone: "neutral", label: "Stable" },
};

/** Trend analysis across a table's saved audit history -- catches a rate drifting toward its tolerance floor over successive patches, not just whether the latest run happens to pass. */
export const DriftAnalysis: React.FC<{ history: AuditRunOut[] }> = ({ history }) => {
  const rows = useMemo(() => computeDrift(history), [history]);

  if (rows.length === 0) {
    return (
      <Card className="p-6 mb-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-2">Drift Analysis</div>
        <p className="text-[13px] text-ink-muted">Needs at least 3 completed audit runs to fit a trend -- run this table's audit a few more times to unlock it.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 mb-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-1">Drift Analysis</div>
      <p className="text-[12.5px] text-ink-muted mb-4">
        Linear trend of each item's advertised/simulated delta across {history.filter((r) => !r.blocked && r.compliance).length} completed runs -- flags rates trending toward their tolerance floor even while the latest run still passes.
      </p>
      <div className="border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="bg-bg text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
              <th className="text-left px-3.5 py-2.5">Item</th>
              <th className="text-left px-3.5 py-2.5">Trend</th>
              <th className="text-left px-3.5 py-2.5">Latest &Delta;</th>
              <th className="text-left px-3.5 py-2.5">Projected</th>
              <th className="text-left px-3.5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {rows.map((row) => {
              const meta = STATUS_META[row.status];
              const TrendIcon = row.slopePerRun > 0 ? TrendingUp : row.slopePerRun < 0 ? TrendingDown : Minus;
              return (
                <tr key={row.itemId}>
                  <td className="px-3.5 py-2.5 font-medium">{row.itemId}</td>
                  <td className="px-3.5 py-2.5 text-ink-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <TrendIcon className="w-3.5 h-3.5" />
                      {row.slopePerRun >= 0 ? "+" : ""}
                      {(row.slopePerRun * 100).toFixed(4)} pp/run
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-muted">
                    {row.latestDelta >= 0 ? "+" : ""}
                    {(row.latestDelta * 100).toFixed(3)} pp
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-muted">
                    {row.runsToBreach !== null
                      ? `~${row.runsToBreach} more run${row.runsToBreach === 1 ? "" : "s"} to breach tolerance`
                      : "--"}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge tone={meta.tone} solid>
                      {meta.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
