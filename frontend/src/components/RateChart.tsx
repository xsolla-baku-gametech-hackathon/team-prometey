import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ItemFlag } from "../types";

const STATUS_COLOR: Record<string, string> = {
  green: "#059669",
  yellow: "#d97706",
  red: "#dc2626",
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
      <div className="text-[12px] font-medium text-ink-muted mb-2">Advertised vs. Simulated Rate (%)</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d2d2d7" />
          <XAxis dataKey="item" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="advertised" name="Advertised" fill="#a1a1a6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="simulated" name="Simulated" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.item} fill={STATUS_COLOR[d.status] ?? "#0071e3"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
