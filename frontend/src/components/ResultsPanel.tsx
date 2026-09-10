import React from "react";
import type { AuditResponse, LootTable } from "../types";
import { RateChart } from "./RateChart";
import { PityChart } from "./PityChart";
import { downloadComplianceReport } from "../lib/report";

const STATUS_LABEL: Record<string, string> = {
  green: "Compliant",
  yellow: "Borderline",
  red: "Non-Compliant",
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export const ResultsPanel: React.FC<{ result: AuditResponse | null; isRunning: boolean; table: LootTable | null }> = ({
  result,
  isRunning,
  table,
}) => {
  if (isRunning) {
    return (
      <div className="panel results-panel">
        <div className="empty-state">Running audit...</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="panel results-panel">
        <div className="empty-state">
          Pick a sample table (or paste/upload your own) and click <b>Run Audit</b> to see validation, simulation,
          and compliance results here.
        </div>
      </div>
    );
  }

  const { validation_issues, blocked, simulation, compliance } = result;

  return (
    <div className="panel results-panel">
      <div className="panel-title-row">
        <div className="panel-title">Audit Results</div>
        {compliance && <StatusBadge status={compliance.overall_status} />}
        {blocked && <span className="badge badge-red">Blocked</span>}
        <div className="panel-title-spacer" />
        {table && (
          <button className="btn-export" onClick={() => downloadComplianceReport(table, result)}>
            Export Report
          </button>
        )}
      </div>

      {validation_issues.length > 0 && (
        <div className="issues-section">
          <div className="section-label">Validation Issues ({validation_issues.length})</div>
          <ul className="issues-list">
            {validation_issues.map((issue, i) => (
              <li key={i} className={`issue issue-${issue.severity}`}>
                <span className="issue-sev">{issue.severity === "error" ? "ERROR" : "WARN"}</span>
                <span className="issue-code">{issue.code}</span>
                <span className="issue-msg">{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocked && (
        <div className="blocked-note">
          Simulation was not run: the table has blocking errors above that would make results meaningless. Fix them
          and re-run.
        </div>
      )}

      {compliance && simulation && (
        <>
          <div className="section-label">Item Compliance</div>
          <table className="flags-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Advertised</th>
                <th>Simulated</th>
                <th>Delta</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {compliance.item_flags.map((f) => (
                <tr key={f.item_id}>
                  <td>{f.item_id}</td>
                  <td>{(f.advertised_rate * 100).toFixed(2)}%</td>
                  <td>{(f.simulated_rate * 100).toFixed(2)}%</td>
                  <td className={f.delta > 0 ? "delta-pos" : f.delta < 0 ? "delta-neg" : ""}>
                    {f.delta >= 0 ? "+" : ""}
                    {(f.delta * 100).toFixed(3)} pp
                  </td>
                  <td>
                    <StatusBadge status={f.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <RateChart flags={compliance.item_flags} />

          {compliance.pity_flag && (
            <div className="pity-section">
              <div className="section-label">
                Pity Compliance <StatusBadge status={compliance.pity_flag.status} />
              </div>
              <p className="pity-message">{compliance.pity_flag.message}</p>
              {simulation.pity && <PityChart pity={simulation.pity} />}
            </div>
          )}

          <div className="section-label">Simulation</div>
          <div className="sim-meta">
            {simulation.num_pulls.toLocaleString()} pulls simulated
            {simulation.pity ? ` -- ${simulation.pity.forced_hits.toLocaleString()} pity saves` : ""}.
          </div>
        </>
      )}
    </div>
  );
};
