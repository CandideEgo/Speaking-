"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useChartTheme } from "@/lib/chart-theme";

const Pie = dynamic(() => import("recharts").then((m) => m.Pie), { ssr: false });
const PieChart = dynamic(() => import("recharts").then((m) => m.PieChart), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), {
  ssr: false,
});
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });

export interface EventDistributionItem {
  event_type: string;
  count: number;
}

const LABELS: Record<string, string> = {
  learned_words: "学词",
  completed_video: "看完",
  practiced_items: "练习",
  reviewed_words: "复习",
  shadowed_sentences: "跟读",
};

const COLORS = ["#FF6B4A", "#5BC0BE", "#9BC1FF", "#FFC857", "#F4A6C0"];

interface EventDistributionChartProps {
  data: EventDistributionItem[];
}

/**
 * D5 事件占比环形图（recharts, next/dynamic 懒加载）。
 * Empty state: muted message instead of a blank circle.
 */
export function EventDistributionChart({ data }: EventDistributionChartProps) {
  const chartTheme = useChartTheme();
  const chartData = useMemo(
    () =>
      data
        .map((d) => ({
          name: LABELS[d.event_type] ?? d.event_type,
          value: d.count,
          raw: d.event_type,
        }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value),
    [data]
  );

  if (chartData.length === 0) {
    return (
      <div className="text-xs text-muted text-center py-6">
        还没有学习活动 — 看完第一个视频后这里会显示事件分布
      </div>
    );
  }

  return (
    <div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              dataKey="value"
              paddingAngle={2}
            >
              {chartData.map((_, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                  stroke={chartTheme.tooltipStyle.background as string}
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={chartTheme.tooltipStyle}
              formatter={(value, name) => [String(value ?? 0), String(name ?? "")]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
        {chartData.map((d, i) => (
          <span key={d.raw} className="inline-flex items-center gap-1 text-[11px] text-muted">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            {d.name} {d.value}
          </span>
        ))}
      </div>
    </div>
  );
}
