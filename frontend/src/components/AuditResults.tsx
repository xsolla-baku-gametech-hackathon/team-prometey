import React, { useState } from "react";
import { Download, Wrench } from "lucide-react";
import type { AuditRunOut, LootTable } from "../types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { RateChart } from "./RateChart";
import { PityChart } from "./PityChart";
import { ExportReportModal } from "./ExportReportModal";

const STATUS_TONE: Record<string, "green" | "yellow" | "red"> = { green: "green", yellow: "yellow", red: "red" };
const STATUS_LABEL: Record<string, string> = { green: "Compliant", yellow: "Borderline", red: "Non-Compliant" };

function formatPValue(p: number): string {
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

export const AuditResults: React.FC<{
  result: AuditRunOut;
  table: LootTable;
  canExport: boolean;
  onApplyFix?: (itemId: string, suggestedWeight: number) => void;
  isApplyingFix?: boolean;
}> = ({ result, table, canExport, onApplyFix, isApplyingFix = false }) => {
  const { validation_issues, blocked, simulation, compliance } = result;
  const fixableFlags = compliance?.item_flags.filter((f) => f.suggested_weight !== null) ?? [];
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-3">
        {compliance && (
          <Badge tone={STATUS_TONE[compliance.overall_status]} solid>
            {STATUS_LABEL[compliance.overall_status]}
          </Badge>
        )}
        {blocked && (
          <Badge tone="red" solid>
            Blocked
          </Badge>
        )}
        <span className="text-[12px] text-ink-muted">{new Date(result.created_at).toLocaleString()}</span>
        <div className="flex-1" />
        {canExport && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setIsExportOpen(true)} className="!py-1.5 !text-[13px]">
              <Download className="w-3.5 h-3.5" /> Export Report
            </Button>
            <ExportReportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} table={table} result={result} />
          </div>
        )}
      </div>

      {validation_issues.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-2.5">
            Validation Issues ({validation_issues.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {validation_issues.map((issue, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${
                  issue.severity === "error" ? "bg-danger-soft border-danger/25" : "bg-warning-soft border-warning/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge tone={issue.severity === "error" ? "red" : "yellow"} solid>
                    {issue.severity}
                  </Badge>
                  <span className="font-mono text-[10.5px] text-ink-muted truncate">{issue.code}</span>
                </div>
                <p className="text-[12.5px] leading-[1.5] text-ink">{issue.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {blocked && (
        <div className="text-[13px] text-danger bg-danger-soft border border-danger/25 rounded-lg px-3.5 py-2.5">
          Simulation was not run -- the blocking errors above would make results meaningless. Fix them and re-run.
        </div>
      )}

      {compliance && simulation && (
        <>
          <div>
            <div className="flex items-baseline justify-between mb-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Item Compliance</div>
              <div className="text-[11px] text-ink-muted">
                {compliance.region_id} region &middot; &alpha;={compliance.alpha.toExponential(2)} (Bonferroni-adjusted)
              </div>
            </div>
            <div className="flex flex-col gap-5">
              <div className="border border-line rounded-lg overflow-x-auto">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="bg-bg text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                      <th className="text-left px-3.5 py-2.5">Item</th>
                      <th className="text-left px-3.5 py-2.5">Advertised</th>
                      <th className="text-left px-3.5 py-2.5">Simulated</th>
                      <th className="text-left px-3.5 py-2.5">95% CI</th>
                      <th className="text-left px-3.5 py-2.5">Delta</th>
                      <th className="text-left px-3.5 py-2.5">p-value</th>
                      <th className="text-left px-3.5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {compliance.item_flags.map((f) => (
                      <tr key={f.item_id}>
                        <td className="px-3.5 py-2.5 font-medium">{f.item_id}</td>
                        <td className="px-3.5 py-2.5 text-ink-muted">{(f.advertised_rate * 100).toFixed(2)}%</td>
                        <td className="px-3.5 py-2.5 text-ink-muted">{(f.simulated_rate * 100).toFixed(2)}%</td>
                        <td className="px-3.5 py-2.5 text-ink-muted whitespace-nowrap">
                          [{(f.ci_low * 100).toFixed(2)}%, {(f.ci_high * 100).toFixed(2)}%]
                        </td>
                        <td className={`px-3.5 py-2.5 ${f.delta > 0 ? "text-success" : f.delta < 0 ? "text-danger" : "text-ink-muted"}`}>
                          {f.delta >= 0 ? "+" : ""}
                          {(f.delta * 100).toFixed(3)} pp
                        </td>
                        <td className="px-3.5 py-2.5 text-ink-muted font-mono text-[12px]">{formatPValue(f.p_value)}</td>
                        <td className="px-3.5 py-2.5">
                          <Badge tone={STATUS_TONE[f.status]} solid>
                            {f.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <RateChart flags={compliance.item_flags} />
            </div>
          </div>

          {fixableFlags.length > 0 && (
            <div className="border border-accent/25 bg-accent-soft rounded-lg p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent mb-3">
                <Wrench className="w-3.5 h-3.5" /> Suggested Fixes
              </div>
              <div className="flex flex-col gap-2">
                {fixableFlags.map((f) => {
                  const currentWeight = table.items.find((it) => it.id === f.item_id)?.weight;
                  return (
                    <div
                      key={f.item_id}
                      className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-line rounded-md px-3.5 py-2.5"
                    >
                      <p className="text-[13px] text-ink">
                        <span className="font-medium">{f.item_id}</span>{" "}
                        <span className="text-ink-muted">
                          -- weight {currentWeight ?? "?"} &rarr; <b className="text-ink">{f.suggested_weight}</b> would
                          hit the advertised {(f.advertised_rate * 100).toFixed(2)}% rate exactly.
                        </span>
                      </p>
                      {onApplyFix && (
                        <Button
                          variant="secondary"
                          onClick={() => onApplyFix(f.item_id, f.suggested_weight as number)}
                          disabled={isApplyingFix}
                          className="!py-1.5 !text-[12.5px] shrink-0"
                        >
                          {isApplyingFix ? "Applying..." : "Apply Fix & Re-run"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {compliance.pity_flag && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-2.5 flex items-center gap-2">
                Pity Compliance
                <Badge tone={compliance.pity_flag.status === "green" ? "green" : "red"} solid>
                  {compliance.pity_flag.status}
                </Badge>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-center">
                <p className="text-[13px] leading-[1.6] text-ink-muted">{compliance.pity_flag.message}</p>
                {simulation.pity && <PityChart pity={simulation.pity} />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
