"use client";

/**
 * GrowthTrendChart — recharts area chart for the admin overview page.
 * Split out so the recharts bundle loads lazily via next/dynamic.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface GrowthTrendPoint {
  date: string;
  注册: number;
  活跃: number;
  词汇: number;
}

export function GrowthTrendChart({ data }: { data: GrowthTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradSignup" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ff5a1f" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#ff5a1f" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradActive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--muted-c)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-c)" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid var(--hairline)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Area
          type="monotone"
          dataKey="注册"
          stroke="#ff5a1f"
          strokeWidth={2}
          fill="url(#gradSignup)"
        />
        <Area
          type="monotone"
          dataKey="活跃"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#gradActive)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
