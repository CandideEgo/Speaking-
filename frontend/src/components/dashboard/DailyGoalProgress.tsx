"use client";

import { ProgressRing } from "@/components/ui/ProgressRing";

interface DailyGoalProgressProps {
  goalType: string | null;
  goalValue: number;
  todayProgress: {
    speaking_attempts: number;
    words_reviewed: number;
    words_added: number;
    videos_watched: number;
    time_spent_seconds: number;
    goal_met: boolean;
  };
}

export default function DailyGoalProgress({
  goalType,
  goalValue,
  todayProgress,
}: DailyGoalProgressProps) {
  // No goal set
  if (!goalType || goalValue === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-cream-soft border border-hairline px-4 py-2">
        <span className="text-sm text-muted-foreground">未设置每日目标</span>
        <a href="/profile" className="text-xs text-coral hover:underline">
          去设置
        </a>
      </div>
    );
  }

  let current: number;
  let unit: string;

  switch (goalType) {
    case "speaking_attempts":
      current = todayProgress.speaking_attempts;
      unit = "次跟读";
      break;
    case "words":
      current = todayProgress.words_reviewed + todayProgress.words_added;
      unit = "个单词";
      break;
    case "minutes":
      current = Math.floor(todayProgress.time_spent_seconds / 60);
      unit = "分钟";
      break;
    default:
      current = 0;
      unit = "";
  }

  const progress = Math.min(current / goalValue, 1);
  const isMet = todayProgress.goal_met;

  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-cream-card border border-hairline px-4 py-2">
      {/* Circular progress */}
      <ProgressRing
        progress={progress}
        isMet={isMet}
        label={`${Math.round(progress * 100)}%`}
      />
      <div className="flex flex-col">
        <span
          className={`text-sm font-medium ${isMet ? "text-green-600" : "text-ink"}`}
        >
          {isMet ? "✓ 今日目标已达成" : `${current}/${goalValue} ${unit}`}
        </span>
      </div>
    </div>
  );
}
