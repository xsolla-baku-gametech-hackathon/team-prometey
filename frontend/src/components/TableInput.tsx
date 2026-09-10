import React, { useState } from "react";
import type { LootTable } from "../types";

interface TableInputProps {
  samples: Record<string, LootTable>;
  onRun: (table: LootTable, opts: { num_pulls: number; tolerance: number }) => void;
  isRunning: boolean;
  error: string | null;
}

const DEFAULT_JSON = `{
  "table_id": "",
  "advertised_rates": {},
  "items": [],
  "pity": null
}`;

export const TableInput: React.FC<TableInputProps> = ({ samples, onRun, isRunning, error }) => {
  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [parseError, setParseError] = useState<string | null>(null);
  const [numPulls, setNumPulls] = useState(300_000);
  const [tolerance, setTolerance] = useState(0.001);
  const [selectedSample, setSelectedSample] = useState("");

  const handleSampleChange = (name: string) => {
    setSelectedSample(name);
    if (name && samples[name]) {
      setJsonText(JSON.stringify(samples[name], null, 2));
      setParseError(null);
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setJsonText(text);
      setSelectedSample("");
      setParseError(null);
    };
    reader.readAsText(file);
  };

  const handleRun = () => {
    try {
      const parsed = JSON.parse(jsonText) as LootTable;
      setParseError(null);
      onRun(parsed, { num_pulls: numPulls, tolerance });
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">Loot Table</div>

      <div className="field-row">
        <label>Sample table</label>
        <select value={selectedSample} onChange={(e) => handleSampleChange(e.target.value)}>
          <option value="">-- choose a sample --</option>
          {Object.keys(samples).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label>Or upload a .json file</label>
        <input
          type="file"
          accept=".json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
          }}
        />
      </div>

      <label className="field-label">Loot table JSON</label>
      <textarea
        className="json-editor"
        value={jsonText}
        onChange={(e) => {
          setJsonText(e.target.value);
          setSelectedSample("");
        }}
        spellCheck={false}
        rows={16}
      />
      {parseError && <div className="inline-error">Invalid JSON: {parseError}</div>}

      <div className="field-row two-col">
        <div>
          <label>Simulated pulls</label>
          <input
            type="number"
            min={1000}
            step={1000}
            value={numPulls}
            onChange={(e) => setNumPulls(Number(e.target.value) || 300_000)}
          />
        </div>
        <div>
          <label>Tolerance (fraction)</label>
          <input
            type="number"
            min={0}
            step={0.0005}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value) || 0.001)}
          />
        </div>
      </div>

      <button className="btn-primary run-btn" onClick={handleRun} disabled={isRunning}>
        {isRunning ? "Running audit..." : "Run Audit"}
      </button>

      {error && <div className="inline-error">{error}</div>}
    </div>
  );
};
