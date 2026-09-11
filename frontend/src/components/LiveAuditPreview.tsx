import React, { useState } from "react";
import { Zap } from "lucide-react";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import type { DemoAuditResult, ItemFlag } from "../types";

const STATUS_TONE: Record<string, "green" | "yellow" | "red"> = { green: "green", yellow: "yellow", red: "red" };
const STATUS_LABEL: Record<string, string> = { green: "Compliant", yellow: "Borderline", red: "Non-Compliant" };

const pct = (r: number) => `${(r * 100).toFixed(2)}%`;

function explain(f: ItemFlag): string {
  if (f.status === "green") {
    return `Simulated ${pct(f.simulated_rate)} is within the 95% CI [${pct(f.ci_low)}, ${pct(f.ci_high)}] of the advertised ${pct(f.advertised_rate)} rate.`;
  }
  const relPct = Math.abs(((f.simulated_rate - f.advertised_rate) / f.advertised_rate) * 100);
  const verb = f.simulated_rate > f.advertised_rate ? "exceeds" : "falls short of";
  return `Simulated ${pct(f.simulated_rate)} ${verb} the advertised ${pct(f.advertised_rate)} rate by ${relPct.toFixed(0)}% -- outside the 95% CI [${pct(f.ci_low)}, ${pct(f.ci_high)}].`;
}

// Illustrative starting point -- real, previously-observed numbers from
// this exact sample table, shown before anyone has clicked "Run Sample
// Audit" yet. No tooltips here (see below) since it isn't a live result.
const EXAMPLE_ROWS = [
  { item_id: "legendary_sword", advertised: "1.00%", simulated: "1.41%", status: "red" as const },
  { item_id: "epic_sword", advertised: "5.00%", simulated: "4.98%", status: "green" as const },
  { item_id: "rare_sword", advertised: "25.00%", simulated: "25.01%", status: "green" as const },
  { item_id: "common_sword", advertised: "70.00%", simulated: "68.61%", status: "red" as const },
];

interface Props {
  result: DemoAuditResult | null;
  isRunning: boolean;
  onRun: () => void;
}

/**
 * Hero product preview -- echoes the real Item Compliance table
 * (AuditResults.tsx). Starts as a static illustrative snapshot; "Run
 * Sample Audit" replaces it with a genuine result from POST /demo/audit
 * (the real validator + Monte Carlo engine, unseeded, run fresh on click)
 * -- not a scripted or incrementing fake number.
 */
export const LiveAuditPreview: React.FC<Props> = ({ result, isRunning, onRun }) => {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const rows = result?.compliance?.item_flags ?? null;
  const overallStatus = result?.compliance?.overall_status;
  const hoveredRow = rows?.find((f) => f.item_id === hoveredItem) ?? null;

  return (
    <div
      className="w-full max-w-[560px] rounded-2xl bg-material-regular backdrop-blur-[30px] backdrop-saturate-[180%]
        shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-5 text-left"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Item Compliance</span>
        <Badge tone={overallStatus ? STATUS_TONE[overallStatus] : "red"} solid>
          {overallStatus ? STATUS_LABEL[overallStatus] : "Non-Compliant"}
        </Badge>
      </div>

      <div className="rounded-[12px] bg-surface overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-tertiary">
              <th className="text-left px-2.5 sm:px-3.5 py-2 whitespace-nowrap">Item</th>
              <th className="text-left px-2.5 sm:px-3.5 py-2 whitespace-nowrap">Advertised</th>
              <th className="text-left px-2.5 sm:px-3.5 py-2 whitespace-nowrap">Simulated</th>
              <th className="text-left px-2.5 sm:px-3.5 py-2 whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {rows
              ? rows.map((f) => (
                  <tr
                    key={f.item_id}
                    onMouseEnter={() => setHoveredItem(f.item_id)}
                    onMouseLeave={() => setHoveredItem((cur) => (cur === f.item_id ? null : cur))}
                    onFocus={() => setHoveredItem(f.item_id)}
                    className={hoveredItem === f.item_id ? "bg-accent-soft/50" : undefined}
                  >
                    <td className="px-2.5 sm:px-3.5 py-2 font-mono text-ink whitespace-nowrap">{f.item_id}</td>
                    <td className="px-2.5 sm:px-3.5 py-2 text-ink-muted whitespace-nowrap">{pct(f.advertised_rate)}</td>
                    <td className="px-2.5 sm:px-3.5 py-2 text-ink-muted whitespace-nowrap">{pct(f.simulated_rate)}</td>
                    <td className="px-2.5 sm:px-3.5 py-2">
                      <Badge tone={STATUS_TONE[f.status]} solid>
                        {f.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              : EXAMPLE_ROWS.map((row) => (
                  <tr key={row.item_id}>
                    <td className="px-2.5 sm:px-3.5 py-2 font-mono text-ink whitespace-nowrap">{row.item_id}</td>
                    <td className="px-2.5 sm:px-3.5 py-2 text-ink-muted whitespace-nowrap">{row.advertised}</td>
                    <td className="px-2.5 sm:px-3.5 py-2 text-ink-muted whitespace-nowrap">{row.simulated}</td>
                    <td className="px-2.5 sm:px-3.5 py-2">
                      <Badge tone={row.status} solid>
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Explanation companion (not a floating tooltip) -- a tooltip nested
          inside the table's overflow-x-auto wrapper would get clipped: per
          the CSS overflow spec, setting overflow-x to anything but visible
          forces overflow-y to auto too, so anything poking out via
          bottom-full gets cut off. This also reads better on touch, where
          hover tooltips don't really work anyway. */}
      <div className="min-h-[52px] mt-3 rounded-[10px] bg-bg px-3.5 py-2.5 text-[11.5px] leading-snug text-ink-muted">
        {rows ? (
          hoveredRow ? (
            explain(hoveredRow)
          ) : (
            <span className="text-ink-tertiary">Hover a row above to see why it passed or failed.</span>
          )
        ) : (
          <span className="text-ink-tertiary">Run the audit to see this filled in with real numbers.</span>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-[11.5px] text-ink-tertiary">
          {result?.simulation ? `Live result -- ${result.simulation.num_pulls.toLocaleString()} pulls, just now` : "Example output above"}
        </p>
        <Button onClick={onRun} disabled={isRunning} className="!py-1.5 !text-[12.5px] !px-3.5">
          <Zap className="w-3.5 h-3.5" /> {isRunning ? "Auditing..." : "Run Sample Audit"}
        </Button>
      </div>
    </div>
  );
};
