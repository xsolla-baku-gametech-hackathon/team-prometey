import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { createTable, fetchSamples } from "../lib/api";
import type { LootTable } from "../types";

const BLANK_JSON = `{
  "table_id": "",
  "advertised_rates": {},
  "items": [],
  "pity": null
}`;

export const NewTablePage: React.FC = () => {
  const navigate = useNavigate();
  const [samples, setSamples] = useState<Record<string, LootTable>>({});
  const [selectedSample, setSelectedSample] = useState("");
  const [name, setName] = useState("");
  const [jsonText, setJsonText] = useState(BLANK_JSON);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSamples().then(setSamples);
  }, []);

  const handleSampleChange = (key: string) => {
    setSelectedSample(key);
    if (key && samples[key]) {
      setJsonText(JSON.stringify(samples[key], null, 2));
      if (!name) setName(samples[key].table_id);
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setJsonText(e.target?.result as string);
      setSelectedSample("");
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    setError(null);
    let parsed: LootTable;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
      return;
    }
    setIsSaving(true);
    try {
      const created = await createTable(name || parsed.table_id || "Untitled Table", parsed);
      navigate(`/tables/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save table");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-[26px] font-semibold tracking-tight mb-1">New Loot Table</h1>
        <p className="text-[13.5px] text-ink-muted mb-8">Paste a config, upload a file, or start from a template.</p>

        <Card className="p-7 flex flex-col gap-5">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Starter Chest v2" />

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-ink-muted">Start from a template</label>
            <select
              value={selectedSample}
              onChange={(e) => handleSampleChange(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-accent"
            >
              <option value="">-- choose a sample --</option>
              {Object.keys(samples).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-ink-muted">Or upload a .json file</label>
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
              className="text-[13px]"
            />
          </div>

          <Textarea
            label="Loot table JSON"
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setSelectedSample("");
            }}
            rows={14}
            spellCheck={false}
          />

          {error && <div className="text-[13px] text-danger bg-danger-soft rounded-md px-3 py-2">{error}</div>}

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save & Continue"}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/dashboard")}>
              Cancel
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
};
