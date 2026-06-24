"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { UserStats } from "@/types";

interface TrendChartProps {
  stats: UserStats | null;
}

export default function TrendChart({ stats }: TrendChartProps) {
  if (!stats?.trend) return null;

  // Build recharts data array from trend
  const data = stats.trend.dates.map((date, i) => ({
    date,
    accuracy: stats.trend!.accuracy[i],
    fluency: stats.trend!.fluency[i],
    completeness: stats.trend!.completeness[i],
  }));

  // Format date for display
  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  return (
    <div className="card-outline !p-5">
      <h3 className="text-xs font-semibold uppercase tracking-caption-wide text-muted-foreground mb-4">
        本周趋势
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6dfd8" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#6b6b6b" }}
            axisLine={{ stroke: "#e6dfd8" }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#6b6b6b" }}
            axisLine={{ stroke: "#e6dfd8" }}
          />
          <Tooltip
            contentStyle={{
              background: "#faf9f5",
              border: "1px solid #e6dfd8",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Line
            type="monotone"
            dataKey="accuracy"
            stroke="#cc785c"
            strokeWidth={2}
            dot={{ r: 3, fill: "#cc785c" }}
            name="准确度"
          />
          <Line
            type="monotone"
            dataKey="fluency"
            stroke="#5db8a6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#5db8a6" }}
            name="流利度"
          />
          <Line
            type="monotone"
            dataKey="completeness"
            stroke="#e8a55a"
            strokeWidth={2}
            dot={{ r: 3, fill: "#e8a55a" }}
            name="完整度"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
