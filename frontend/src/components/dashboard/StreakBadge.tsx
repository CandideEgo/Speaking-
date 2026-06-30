"use client";

import { Flame } from "lucide-react";

interface StreakBadgeProps {
  currentStreak: number;
  longestStreak: number;
}

export default function StreakBadge({
  currentStreak,
  longestStreak,
}: StreakBadgeProps) {
  if (currentStreak === 0 && longestStreak === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-cream-card border border-hairline px-4 py-2">
      <Flame
        size={20}
        className={currentStreak > 0 ? "text-coral" : "text-muted-foreground"}
      />
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-2xl text-ink">{currentStreak}</span>
        <span className="text-sm text-muted-foreground">天连续学习</span>
      </div>
      {longestStreak > 0 && (
        <span className="text-xs text-muted-foreground border-l border-hairline pl-2 ml-1">
          最长 {longestStreak} 天
        </span>
      )}
    </div>
  );
}
