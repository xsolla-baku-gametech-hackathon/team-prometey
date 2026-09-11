import React, { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { fetchRegions } from "../lib/api";
import type { RegionRule } from "../types";

const REGION_ORDER = ["global", "belgium", "netherlands", "china", "south_korea"];

/** Strictness relative to the global baseline -- computed from the real region data (app.regions), not a hardcoded label. */
function strictnessOf(rule: RegionRule, baseline: RegionRule): "Strictest" | "Stricter" | "Standard" {
  if (rule.id === baseline.id) return "Standard";
  const tighter = rule.alpha < baseline.alpha && rule.min_pp_floor < baseline.min_pp_floor;
  if (!tighter) return "Standard";
  return rule.alpha <= baseline.alpha / 1.5 ? "Strictest" : "Stricter";
}

/** Muted, map-legend-style jurisdiction list -- deliberately not a literal geographic SVG map (no map asset/library, keeps the bundle as-is) but the same "which regions, how strict" information a map would carry, sourced live from GET /regions. */
export const RegulatoryCoverage: React.FC = () => {
  const [regions, setRegions] = useState<Record<string, RegionRule> | null>(null);

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => setRegions({}));
  }, []);

  if (!regions || Object.keys(regions).length === 0) return null;
  const baseline = regions.global;
  const ordered = REGION_ORDER.filter((id) => regions[id]).map((id) => regions[id]);

  return (
    <section className="max-w-5xl mx-auto px-6 py-24">
      <div className="text-center mb-12">
        <div className="w-11 h-11 rounded-[12px] bg-accent-soft text-accent flex items-center justify-center mx-auto mb-4">
          <Globe2 className="w-5 h-5" />
        </div>
        <h2 className="text-[28px] font-semibold tracking-tight text-ink">Regulatory coverage</h2>
        <p className="mt-2 text-[15px] text-ink-muted max-w-lg mx-auto">
          Every audit can be judged against a region-specific rule pack -- pick one per run from the table detail
          page.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ordered.map((rule) => {
          const strictness = baseline ? strictnessOf(rule, baseline) : "Standard";
          return (
            <Card key={rule.id} className="p-6">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[15px] font-semibold text-ink">{rule.label}</h3>
                <Badge tone={strictness === "Standard" ? "neutral" : "accent"}>{strictness}</Badge>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-muted">{rule.note}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
