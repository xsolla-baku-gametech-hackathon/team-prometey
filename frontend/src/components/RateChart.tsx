import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ItemFlag } from "../types";

// Apple system colors: gray for the advertised baseline, green/amber/red
// per item status for the simulated bar -- so a non-compliant item's bar
// reads as an outlier at a glance, not just via the table below it.
const STATUS_COLOR: Record<string, string> = {
  green: "#34c759",
  yellow: "#ff9f0a",
  red: "#ff3b30",
};

export const RateChart: React.FC<{ flags: ItemFlag[] }> = ({ flags }) => {
  const data = flags.map((f) => ({
    item: f.item_id,
    advertised: Number((f.advertised_rate * 100).toFixed(3)),
    simulated: Number((f.simulated_rate * 100).toFixed(3)),
    status: f.status,
  }));

  return (
    <div className="bg-bg border border-line rounded-lg p-4">
      <div className="text-[15px] font-semibold text-ink mb-3">Advertised vs. Simulated Rate (%)</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
          <XAxis dataKey="item" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="advertised" name="Advertised" fill="#8e8e93" radius={[4, 4, 0, 0]} />
          <Bar dataKey="simulated" name="Simulated" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.item} fill={STATUS_COLOR[d.status] ?? "#007aff"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
