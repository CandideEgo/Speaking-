"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface HeatmapDay {
  date: string;
  count: number;
  active: boolean;
}

interface HeatmapCalendarProps {
  days: HeatmapDay[];
  range?: 30 | 90;
}

/**
 * D5 GitHub-style activity heatmap. 7-row grid of 12px cells with 4
 * intensity tiers. Month labels above, weekday labels on the left.
 * Mobile-friendly via overflow-x-auto.
 */
export function HeatmapCalendar({ days, range: _range = 90 }: HeatmapCalendarProps) {
  const { cells, monthLabels } = useMemo(() => {
    if (!days.length) {
      return {
        cells: [] as { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }[],
        monthLabels: [] as { col: number; label: string }[],
        maxCount: 0,
      };
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    const labelMap = new Map<string, number>();
    days.forEach((d, i) => {
      const m = d.date.slice(0, 7);
      if (!labelMap.has(m)) labelMap.set(m, i);
    });
    const labels = Array.from(labelMap.entries()).map(([m, col]) => ({
      col,
      label: m.slice(5, 7) + "月",
    }));
    return {
      cells: days.map((d) => ({
        date: d.date,
        count: d.count,
        level:
          d.count === 0
            ? 0
            : d.count >= max * 0.66
              ? 4
              : d.count >= max * 0.33
                ? 3
                : d.count >= max * 0.1
                  ? 2
                  : 1,
      })),
      monthLabels: labels,
      maxCount: max,
    };
  }, [days]);

  if (!cells.length) {
    return (
      <div className="text-xs text-muted text-center py-6">还没有学习活动 — 开始看第一个视频吧</div>
    );
  }

  const cols = Math.ceil(cells.length / 7);
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex mb-1 ml-7" style={{ height: 14 }}>
          {Array.from({ length: cols }).map((_, col) => {
            const ml = monthLabels.find((m) => Math.floor(m.col / 7) === col);
            return (
              <div
                key={col}
                className="text-[10px] text-muted-soft"
                style={{ width: 14, marginRight: 2 }}
              >
                {ml?.label ?? ""}
              </div>
            );
          })}
        </div>
        <div className="flex">
          <div className="flex flex-col mr-1.5 text-[10px] text-muted-soft" style={{ width: 24 }}>
            <span style={{ height: 14, lineHeight: "14px" }}>一</span>
            <span style={{ height: 14, lineHeight: "14px" }}>&nbsp;</span>
            <span style={{ height: 14, lineHeight: "14px" }}>三</span>
            <span style={{ height: 14, lineHeight: "14px" }}>&nbsp;</span>
            <span style={{ height: 14, lineHeight: "14px" }}>五</span>
            <span style={{ height: 14, lineHeight: "14px" }}>&nbsp;</span>
            <span style={{ height: 14, lineHeight: "14px" }}>日</span>
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-[2px]">
            {cells.map((c) => (
              <div
                key={c.date}
                title={c.date + " · " + c.count + " 次"}
                className={cn(
                  "w-[12px] h-[12px] rounded-[3px] transition-colors",
                  c.level === 0 && "bg-surface-soft",
                  c.level === 1 && "bg-brand-100 dark:bg-brand-900/40",
                  c.level === 2 && "bg-brand-300 dark:bg-brand-700/60",
                  c.level === 3 && "bg-brand-500/80",
                  c.level === 4 && "bg-brand-500"
                )}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-muted-soft">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <div
              key={l}
              className={cn(
                "w-[12px] h-[12px] rounded-[3px]",
                l === 0 && "bg-surface-soft",
                l === 1 && "bg-brand-100 dark:bg-brand-900/40",
                l === 2 && "bg-brand-300 dark:bg-brand-700/60",
                l === 3 && "bg-brand-500/80",
                l === 4 && "bg-brand-500"
              )}
            />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  );
}
