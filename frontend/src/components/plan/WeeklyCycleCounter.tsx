"use client";

import { Repeat } from "lucide-react";
import type { DailyProgress } from "@/types";

interface WeeklyCycleCounterProps {
  progress: DailyProgress | null;
}

/**
 * Weekly cycle counter — the north-star metric per ADR-0012.
 * Counts complete learning cycles (watch + vocab + practice + review)
 * the user completed this week, out of 7.
 */
export function WeeklyCycleCounter({ progress }: WeeklyCycleCounterProps) {
  const cycles = progress?.weekly_cycles_completed ?? 0;
  const target = 7;

  return (
    <div className="bg-gradient-to-br from-brand-50 to-canvas border border-brand-100 rounded-lg p-6 flex flex-col justify-between">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 mb-2">
        <Repeat size={13} />
        本周循环
      </div>
      <div>
        <div className="text-[40px] font-extrabold tracking-display-lg leading-none text-brand-600">
          {cycles}
          <span className="text-lg font-semibold text-brand-400">/{target}</span>
        </div>
        <div className="text-xs text-brand-700 mt-1.5">完整学习闭环</div>
      </div>
      {/* Day dots */}
      <div className="flex gap-1 mt-3">
        {Array.from({ length: target }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < cycles ? "bg-brand-500" : "bg-brand-100"}`}
          />
        ))}
      </div>
    </div>
  );
}
