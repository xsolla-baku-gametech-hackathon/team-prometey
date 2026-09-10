import { useEffect, useState } from "react";
import "./App.css";
import { TableInput } from "./components/TableInput";
import { ResultsPanel } from "./components/ResultsPanel";
import { fetchSamples, runAudit } from "./lib/api";
import type { AuditResponse, LootTable } from "./types";

export default function App() {
  const [samples, setSamples] = useState<Record<string, LootTable>>({});
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    fetchSamples()
      .then((s) => {
        setSamples(s);
        setBackendUp(true);
      })
      .catch(() => setBackendUp(false));
  }, []);

  const handleRun = async (table: LootTable, opts: { num_pulls: number; tolerance: number }) => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await runAudit(table, opts);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">LT</div>
          <div>
            <div className="brand-title">Loot Table Balance Auditor</div>
            <div className="brand-sub">Validate configs, simulate real odds, catch compliance drift</div>
          </div>
        </div>
        <div className={`backend-status ${backendUp ? "up" : backendUp === false ? "down" : ""}`}>
          {backendUp === null ? "Connecting..." : backendUp ? "API connected" : "API unreachable (start the backend on :8000)"}
        </div>
      </header>

      <main className="app-main">
        <TableInput samples={samples} onRun={handleRun} isRunning={isRunning} error={error} />
        <ResultsPanel result={result} isRunning={isRunning} />
      </main>
    </div>
  );
}
