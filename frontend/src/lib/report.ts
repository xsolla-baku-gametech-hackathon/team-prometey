import type { AuditRunOut, LootTable } from "../types";

function triggerDownload(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Machine-readable compliance report (opens cleanly in Excel/Sheets). */
export function downloadComplianceReportCsv(table: LootTable, result: AuditRunOut) {
  const rows: (string | number)[][] = [];

  rows.push(["Table", table.table_id]);
  rows.push(["Audit run", result.id]);
  rows.push(["Generated", result.created_at]);
  rows.push(["Blocked", result.blocked ? "yes" : "no"]);
  rows.push(["Overall status", result.compliance?.overall_status ?? ""]);
  rows.push([]);

  if (result.validation_issues.length > 0) {
    rows.push(["Validation Issues"]);
    rows.push(["Severity", "Code", "Item", "Message"]);
    for (const issue of result.validation_issues) {
      rows.push([issue.severity, issue.code, issue.item_id ?? "", issue.message]);
    }
    rows.push([]);
  }

  if (result.compliance && result.simulation) {
    rows.push(["Simulated pulls", result.simulation.num_pulls]);
    rows.push([]);
    rows.push(["Item Compliance"]);
    rows.push(["Item", "Advertised Rate", "Simulated Rate", "Delta (pp)", "Status"]);
    for (const f of result.compliance.item_flags) {
      rows.push([
        f.item_id,
        (f.advertised_rate * 100).toFixed(4) + "%",
        (f.simulated_rate * 100).toFixed(4) + "%",
        (f.delta * 100).toFixed(4),
        f.status,
      ]);
    }
    if (result.compliance.pity_flag) {
      rows.push([]);
      rows.push(["Pity Compliance", result.compliance.pity_flag.status]);
      rows.push([result.compliance.pity_flag.message]);
    }
  }

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  triggerDownload(csv, "text/csv", `${table.table_id || "loot-table"}-compliance-report.csv`);
}

/** Opens a print-formatted report in a new tab -- use the browser's "Save as PDF" print destination. */
export function openPrintableComplianceReport(table: LootTable, result: AuditRunOut) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const issueRows = result.validation_issues
    .map(
      (issue) =>
        `<tr><td>${esc(issue.severity)}</td><td><code>${esc(issue.code)}</code></td><td>${esc(issue.message)}</td></tr>`
    )
    .join("");

  const itemRows = (result.compliance?.item_flags ?? [])
    .map(
      (f) =>
        `<tr><td>${esc(f.item_id)}</td><td>${(f.advertised_rate * 100).toFixed(2)}%</td><td>${(f.simulated_rate * 100).toFixed(2)}%</td><td>${f.delta >= 0 ? "+" : ""}${(f.delta * 100).toFixed(3)} pp</td><td class="status-${f.status}">${f.status}</td></tr>`
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(table.table_id)} -- Compliance Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif; color: #1d1d1f; padding: 40px; max-width: 760px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #6e6e73; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #6e6e73; margin-top: 28px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e5ea; }
  th { color: #6e6e73; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; }
  .status-green { color: #34c759; font-weight: 600; }
  .status-yellow { color: #b45309; font-weight: 600; }
  .status-red { color: #ff3b30; font-weight: 600; }
  .overall { font-size: 15px; font-weight: 600; margin-top: 4px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Loot Table Compliance Report</h1>
  <div class="meta">
    Table: <code>${esc(table.table_id)}</code> &middot; Run: <code>${esc(result.id)}</code> &middot;
    Generated: ${esc(new Date(result.created_at).toLocaleString())}
  </div>

  ${
    result.blocked
      ? `<p class="overall status-red">Blocked -- simulation was not run because of the validation errors below.</p>`
      : result.compliance
        ? `<p class="overall status-${result.compliance.overall_status}">Overall: ${esc(result.compliance.overall_status.toUpperCase())}</p>`
        : ""
  }

  ${
    result.validation_issues.length > 0
      ? `<h2>Validation Issues (${result.validation_issues.length})</h2>
  <table><thead><tr><th>Severity</th><th>Code</th><th>Message</th></tr></thead><tbody>${issueRows}</tbody></table>`
      : ""
  }

  ${
    result.compliance && result.simulation
      ? `<h2>Item Compliance -- ${result.simulation.num_pulls.toLocaleString()} pulls simulated</h2>
  <table><thead><tr><th>Item</th><th>Advertised</th><th>Simulated</th><th>Delta</th><th>Status</th></tr></thead><tbody>${itemRows}</tbody></table>`
      : ""
  }

  ${
    result.compliance?.pity_flag
      ? `<h2>Pity Compliance</h2><p class="status-${result.compliance.pity_flag.status}">${esc(result.compliance.pity_flag.status.toUpperCase())}</p><p>${esc(result.compliance.pity_flag.message)}</p>`
      : ""
  }

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
