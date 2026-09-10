import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PityStats } from "../types";

export const PityChart: React.FC<{ pity: PityStats }> = ({ pity }) => {
  const data = pity.convergence_histogram.map((b) => ({
    range: `${Math.round(b.range_start)}-${Math.round(b.range_end)}`,
    count: b.count,
  }));

  return (
    <div className="bg-bg border border-line rounded-lg p-4">
      <div className="text-[12px] font-medium text-ink-muted mb-2">
        Pity Convergence -- pulls until &quot;{pity.target_rarity}&quot; ({pity.natural_hits.toLocaleString()} natural,{" "}
        {pity.forced_hits.toLocaleString()} pity-forced)
      </div>
      {data.length === 0 ? (
        <div className="text-[12px] text-ink-muted py-6 text-center">
          Target rarity was never obtained -- naturally or via pity -- across the whole simulation.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d2d2d7" />
            <XAxis
              dataKey="range"
              tick={{ fontSize: 10 }}
              label={{ value: "pulls since previous hit", position: "insideBottom", offset: -4, fontSize: 11 }}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" name="Players" fill="#0071e3" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      <div className="text-[11px] text-ink-muted mt-2">
        Guaranteed within {pity.guaranteed_within_pulls} pulls -- observed worst case:{" "}
        {pity.max_pulls_observed_to_target ?? "never triggered"}
      </div>
    </div>
  );
};
