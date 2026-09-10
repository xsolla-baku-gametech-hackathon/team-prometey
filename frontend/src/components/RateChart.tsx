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
    <div className="chart-box">
      <div className="chart-title">Advertised vs. Simulated Rate (%)</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="item" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="advertised" name="Advertised" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="simulated" name="Simulated" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.item} fill={STATUS_COLOR[d.status] ?? "#2563eb"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
