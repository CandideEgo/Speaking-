"use client";

import { useEffect, useState } from "react";
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
import { TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useChartTheme } from "@/lib/chart-theme";
import type { MasteryTrendResponse } from "@/types";

interface TrendDataPoint {
  date: string;
  label: string;
  newWords: number;
  learning: number;
  mastered: number;
  total: number;
}

/**
 * MasteryTrend — line chart showing vocabulary mastery progression over time.
 * Fetches snapshots from GET /plan/mastery-trend?weeks=N
 */
export function MasteryTrend({ weeks = 8 }: { weeks?: number }) {
  const chartTheme = useChartTheme();
  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchTrend() {
      try {
        const res = await api<MasteryTrendResponse>(`/api/v1/plan/mastery-trend?weeks=${weeks}`);
        if (cancelled) return;

        const points: TrendDataPoint[] = res.snapshots.map((s) => {
          // Aggregate across all exam levels
          let newCount = 0;
          let learningCount = 0;
          let masteredCount = 0;
          let total = 0;

          if (s.mastery_json) {
            for (const level of Object.values(s.mastery_json)) {
              newCount += level.new ?? 0;
              learningCount += (level.learning ?? 0) + (level.reviewing ?? 0);
              masteredCount += level.mastered ?? 0;
              total += level.total ?? 0;
            }
          }

          const d = new Date(s.date);
          return {
            date: s.date,
            label: `${d.getMonth() + 1}/${d.getDate()}`,
            newWords: newCount,
            learning: learningCount,
            mastered: masteredCount,
            total,
          };
        });

        setData(points);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTrend();
    return () => {
      cancelled = true;
    };
  }, [weeks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        加载中...
      </div>
    );
  }

  if (error || data.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <TrendingUp size={24} className="opacity-40" />
        <p className="text-sm">暂无足够数据，继续学习以生成趋势图</p>
      </div>
    );
  }

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
