import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Textarea } from "./ui/Input";
import type { Item, LootTable } from "../types";

const CELL_INPUT =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-ink outline-none " +
  "transition-colors hover:border-line focus:border-accent focus:bg-surface";

function parseJson(text: string): { table: LootTable | null; error: string | null } {
  try {
    const obj = JSON.parse(text);
    return { table: obj, error: null };
  } catch (e) {
    return { table: null, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

/**
 * Structured item editor + raw JSON textarea for a loot table config.
 * `jsonText` is the single source of truth -- the item table below is a
 * live view derived from parsing it, and any GUI edit re-serializes
 * straight back into the same text, so both stay in sync with no
 * separate state to drift apart. Used by both table creation and editing.
 */
export const LootTableEditor: React.FC<{ jsonText: string; onChange: (text: string) => void }> = ({
  jsonText,
  onChange,
}) => {
  const [newItem, setNewItem] = useState({ id: "", rarity: "", weight: "", rate: "" });
  const [addItemError, setAddItemError] = useState<string | null>(null);

  const { table: parsed, error: parseError } = useMemo(() => parseJson(jsonText), [jsonText]);
  const items: Item[] = Array.isArray(parsed?.items) ? parsed!.items : [];
  const advertisedRates: Record<string, number> =
    parsed && typeof parsed.advertised_rates === "object" && parsed.advertised_rates ? parsed.advertised_rates : {};
  const rateSumPct = Object.values(advertisedRates).reduce((sum, r) => sum + (Number(r) || 0), 0) * 100;

  const commitTable = (table: LootTable) => {
    onChange(JSON.stringify(table, null, 2));
  };

  const updateItem = (index: number, patch: Partial<Item>) => {
    if (!parsed) return;
    const nextItems = parsed.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    commitTable({ ...parsed, items: nextItems });
  };

  const updateRate = (id: string, pct: number | null) => {
    if (!parsed) return;
    const nextRates = { ...parsed.advertised_rates };
    if (pct === null || Number.isNaN(pct)) {
      delete nextRates[id];
    } else {
      nextRates[id] = pct / 100;
    }
    commitTable({ ...parsed, advertised_rates: nextRates });
  };

  const removeItem = (id: string) => {
    if (!parsed) return;
    const nextRates = { ...parsed.advertised_rates };
    delete nextRates[id];
    commitTable({ ...parsed, items: parsed.items.filter((it) => it.id !== id), advertised_rates: nextRates });
  };

  const handleAddItem = () => {
    if (!parsed) {
      setAddItemError("Fix the JSON errors below before adding items.");
      return;
    }
    const id = newItem.id.trim();
    if (!id) {
      setAddItemError("Item ID is required.");
      return;
    }
    if (parsed.items.some((it) => it.id === id)) {
      setAddItemError(`An item with id "${id}" already exists.`);
      return;
    }
    const weight = Number(newItem.weight);
    if (!Number.isFinite(weight) || weight < 0) {
      setAddItemError("Weight must be a non-negative number.");
      return;
    }
    const nextRates = { ...parsed.advertised_rates };
    if (newItem.rate.trim() !== "") {
      const pct = Number(newItem.rate);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setAddItemError("Advertised rate must be a number between 0 and 100.");
        return;
      }
      nextRates[id] = pct / 100;
    }
    commitTable({
      ...parsed,
      items: [...parsed.items, { id, rarity: newItem.rarity.trim() || "common", weight }],
      advertised_rates: nextRates,
    });
    setNewItem({ id: "", rarity: "", weight: "", rate: "" });
    setAddItemError(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[13px] font-medium text-ink-muted">Items</label>
          {items.length > 0 && (
            <span className="text-[12px] text-ink-muted">
              {items.length} item{items.length === 1 ? "" : "s"} &middot; advertised rates sum to{" "}
              <span className={Math.abs(rateSumPct - 100) < 0.01 ? "text-success font-medium" : "text-warning font-medium"}>
                {rateSumPct.toFixed(2)}%
              </span>
            </span>
          )}
        </div>

        {parseError ? (
          <div className="text-[13px] text-danger bg-danger-soft border border-danger/25 rounded-lg px-3.5 py-2.5">
            Fix the JSON below to use the visual item editor: {parseError}
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <div className="border border-line rounded-lg overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-bg text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                      <th className="text-left px-3 py-2">Item ID</th>
                      <th className="text-left px-3 py-2">Rarity</th>
                      <th className="text-left px-3 py-2">Weight</th>
                      <th className="text-left px-3 py-2">Advertised %</th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {items.map((item, i) => (
                      <tr key={item.id}>
                        <td className="px-3 py-1 font-mono text-[12.5px] font-medium">{item.id}</td>
                        <td className="px-1 py-1">
                          <input
                            className={CELL_INPUT}
                            value={item.rarity}
                            onChange={(e) => updateItem(i, { rarity: e.target.value })}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className={CELL_INPUT}
                            value={item.weight}
                            onChange={(e) => updateItem(i, { weight: Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            className={CELL_INPUT}
                            placeholder="--"
                            value={
                              advertisedRates[item.id] !== undefined ? Number((advertisedRates[item.id] * 100).toFixed(4)) : ""
                            }
                            onChange={(e) => updateRate(item.id, e.target.value === "" ? null : Number(e.target.value))}
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="text-ink-muted hover:text-danger transition-colors cursor-pointer p-1"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2 bg-bg border border-line rounded-lg p-3">
              <div className="flex flex-col gap-1 flex-1 min-w-[110px]">
                <span className="text-[11px] text-ink-muted">Item ID</span>
                <input
                  className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
                  value={newItem.id}
                  onChange={(e) => setNewItem((s) => ({ ...s, id: e.target.value }))}
                  placeholder="legendary_sword"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[90px]">
                <span className="text-[11px] text-ink-muted">Rarity</span>
                <input
                  className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
                  value={newItem.rarity}
                  onChange={(e) => setNewItem((s) => ({ ...s, rarity: e.target.value }))}
                  placeholder="legendary"
                />
              </div>
              <div className="flex flex-col gap-1 w-20">
                <span className="text-[11px] text-ink-muted">Weight</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
                  value={newItem.weight}
                  onChange={(e) => setNewItem((s) => ({ ...s, weight: e.target.value }))}
                  placeholder="10"
                />
              </div>
              <div className="flex flex-col gap-1 w-24">
                <span className="text-[11px] text-ink-muted">Rate %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
                  value={newItem.rate}
                  onChange={(e) => setNewItem((s) => ({ ...s, rate: e.target.value }))}
                  placeholder="optional"
                />
              </div>
              <Button variant="secondary" onClick={handleAddItem} className="!py-1.5 !text-[13px]">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </Button>
            </div>
            {addItemError && <div className="text-[12.5px] text-danger bg-danger-soft rounded-md px-3 py-2">{addItemError}</div>}
            {items.length === 0 && (
              <div className="flex items-center gap-2">
                <Badge tone="neutral">No items yet</Badge>
                <span className="text-[12px] text-ink-muted">Add one above, or paste/upload a full config below.</span>
              </div>
            )}
          </>
        )}
      </div>

      <Textarea label="Loot table JSON" value={jsonText} onChange={(e) => onChange(e.target.value)} rows={14} spellCheck={false} />
    </div>
  );
};
