import type { AuditRunOut, LootTable } from "../types";

/** Builds a plain-text compliance report and triggers a browser download. */
export function downloadComplianceReport(table: LootTable, result: AuditRunOut) {
  const lines: string[] = [];

  lines.push(`LOOT TABLE COMPLIANCE REPORT`);
  lines.push(`Table: ${table.table_id}`);
  lines.push(`Audit run: ${result.id}`);
  lines.push(`Generated: ${result.created_at}`);
  lines.push("");

  if (result.validation_issues.length === 0) {
    lines.push("Validation: no issues found.");
  } else {
    lines.push(`Validation Issues (${result.validation_issues.length}):`);
    for (const issue of result.validation_issues) {
      lines.push(`  [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`);
    }
  }
  lines.push("");

  if (result.blocked) {
    lines.push("Simulation was NOT run -- blocking validation errors above must be fixed first.");
  } else if (result.compliance && result.simulation) {
    lines.push(`Overall Compliance: ${result.compliance.overall_status.toUpperCase()}`);
    lines.push(`Simulated pulls: ${result.simulation.num_pulls.toLocaleString()}`);
    lines.push(
      `Tolerance: +/- ${(result.compliance.tolerance * 100).toFixed(2)} percentage points (or 3 sampling standard errors, whichever is larger)`
    );
    lines.push("");
    lines.push("Item Compliance:");
    for (const f of result.compliance.item_flags) {
      lines.push(
        `  [${f.status.toUpperCase()}] ${f.item_id}: advertised ${(f.advertised_rate * 100).toFixed(2)}% vs simulated ${(f.simulated_rate * 100).toFixed(2)}% (delta ${f.delta >= 0 ? "+" : ""}${(f.delta * 100).toFixed(3)}pp)`
      );
    }
    if (result.compliance.pity_flag) {
      lines.push("");
      lines.push(`Pity Compliance: [${result.compliance.pity_flag.status.toUpperCase()}] ${result.compliance.pity_flag.message}`);
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${table.table_id || "loot-table"}-compliance-report.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
