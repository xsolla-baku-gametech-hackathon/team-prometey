import React from "react";
import { Download, AlertTriangle } from "lucide-react";
import type { AuditRunOut, LootTable } from "../types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { RateChart } from "./RateChart";
import { PityChart } from "./PityChart";
import { downloadComplianceReport } from "../lib/report";

const STATUS_TONE: Record<string, "green" | "yellow" | "red"> = { green: "green", yellow: "yellow", red: "red" };
const STATUS_LABEL: Record<string, string> = { green: "Compliant", yellow: "Borderline", red: "Non-Compliant" };

export const AuditResults: React.FC<{ result: AuditRunOut; table: LootTable; canExport: boolean }> = ({
  result,
  table,
  canExport,
}) => {
  const { validation_issues, blocked, simulation, compliance } = result;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {compliance && <Badge tone={STATUS_TONE[compliance.overall_status]}>{STATUS_LABEL[compliance.overall_status]}</Badge>}
        {blocked && <Badge tone="red">Blocked</Badge>}
        <span className="text-[12px] text-ink-muted">{new Date(result.created_at).toLocaleString()}</span>
        <div className="flex-1" />
        {canExport && (
          <Button variant="secondary" onClick={() => downloadComplianceReport(table, result)} className="!py-1.5 !text-[13px]">
            <Download className="w-3.5 h-3.5" /> Export Report
          </Button>
        )}
      </div>

      {validation_issues.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2">
            Validation Issues ({validation_issues.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {validation_issues.map((issue, i) => (
              <div
                key={i}
                className={`flex items-start gap-2.5 rounded-md px-3 py-2 text-[13px] border-l-2 ${
                  issue.severity === "error"
                    ? "bg-danger-soft border-l-danger text-danger"
                    : "bg-warning-soft border-l-warning text-warning"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <span className="font-mono text-[11px] font-semibold mr-2">{issue.code}</span>
                  <span className="text-ink">{issue.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {blocked && (
        <div className="text-[13px] text-danger bg-danger-soft rounded-md px-3.5 py-2.5">
          Simulation was not run -- the blocking errors above would make results meaningless. Fix them and re-run.
        </div>
      )}

      {compliance && simulation && (
        <>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2">Item Compliance</div>
            <div className="border border-line rounded-lg overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-bg text-[10.5px] uppercase tracking-wide text-ink-muted">
                    <th className="text-left font-medium px-3 py-2">Item</th>
                    <th className="text-left font-medium px-3 py-2">Advertised</th>
                    <th className="text-left font-medium px-3 py-2">Simulated</th>
                    <th className="text-left font-medium px-3 py-2">Delta</th>
                    <th className="text-left font-medium px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {compliance.item_flags.map((f) => (
                    <tr key={f.item_id} className="border-t border-line">
                      <td className="px-3 py-2 font-medium">{f.item_id}</td>
                      <td className="px-3 py-2 text-ink-muted">{(f.advertised_rate * 100).toFixed(2)}%</td>
                      <td className="px-3 py-2 text-ink-muted">{(f.simulated_rate * 100).toFixed(2)}%</td>
                      <td className={`px-3 py-2 ${f.delta > 0 ? "text-success" : f.delta < 0 ? "text-danger" : "text-ink-muted"}`}>
                        {f.delta >= 0 ? "+" : ""}
                        {(f.delta * 100).toFixed(3)} pp
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <RateChart flags={compliance.item_flags} />

          {compliance.pity_flag && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2 flex items-center gap-2">
                Pity Compliance <Badge tone={compliance.pity_flag.status === "green" ? "green" : "red"}>{compliance.pity_flag.status}</Badge>
              </div>
              <p className="text-[13px] text-ink-muted mb-3">{compliance.pity_flag.message}</p>
              {simulation.pity && <PityChart pity={simulation.pity} />}
            </div>
          )}

          <p className="text-[12px] text-ink-muted">
            {simulation.num_pulls.toLocaleString()} pulls simulated
            {simulation.pity ? ` -- ${simulation.pity.forced_hits.toLocaleString()} pity saves` : ""}.
          </p>
        </>
      )}
    </div>
  );
};
