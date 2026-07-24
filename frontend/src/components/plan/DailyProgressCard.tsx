"use client";

import { Target, Flame, Clock } from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import type { DailyProgress } from "@/types";

interface DailyProgressCardProps {
  progress: DailyProgress | null;
}

export function DailyProgressCard({ progress }: DailyProgressCardProps) {
  if (!progress) {
    return (
      <div className="bg-canvas border border-hairline rounded-lg p-6">
        <div className="text-sm text-muted">加载今日进度…</div>
      </div>
    );
  }

  const goalProgress = progress.goal_progress ?? 0;
  const currentValue =
    progress.daily_goal_type === "words"
      ? progress.today_words_learned
      : progress.today_minutes_spent;
  const goalUnit = progress.daily_goal_type === "words" ? "词" : "分钟";

  return (
    <div className="bg-canvas border border-hairline rounded-lg p-6 flex items-center gap-5">
      <ProgressRing
        progress={goalProgress}
        size={84}
        strokeWidth={6}
        isMet={progress.goal_met}
        label={<span className="text-base font-bold">{Math.round(goalProgress * 100)}%</span>}
      />
      <div className="flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
          <Target size={13} />
          每日目标
        </div>
        <div className="text-[28px] font-extrabold tracking-display-lg leading-none text-ink">
          {currentValue}
          <span className="text-base font-semibold text-muted ml-1">
            / {progress.daily_goal_value} {goalUnit}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-2.5 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Flame size={13} className="text-coral" />
            {progress.current_streak} 天连续
          </span>
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {progress.today_minutes_spent} 分钟
          </span>
        </div>
      </div>
    </div>
  );
}
