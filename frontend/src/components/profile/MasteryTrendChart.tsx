"use client";

/**
 * MasteryTrendChart — recharts rendering split out of MasteryTrend so the
 * heavy recharts bundle loads via next/dynamic only when data is ready.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChartTheme } from "@/lib/chart-theme";

export interface TrendDataPoint {
  date: string;
  label: string;
  newWords: number;
  learning: number;
  mastered: number;
  total: number;
}

export function MasteryTrendChart({ data }: { data: TrendDataPoint[] }) {
  const chartTheme = useChartTheme();

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: chartTheme.tick }}
            axisLine={{ stroke: chartTheme.axis }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: chartTheme.tick }}
            axisLine={{ stroke: chartTheme.axis }}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip contentStyle={chartTheme.tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          <Line
            type="monotone"
            dataKey="total"
            name="总词汇"
            stroke={chartTheme.series.brand}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="mastered"
            name="已掌握"
            stroke={chartTheme.series.success}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="learning"
            name="学习中"
            stroke={chartTheme.series.warning}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
