"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreakBadgeProps {
  streak: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

/**
 * D5 shared streak display. Streak = 0 renders a muted flame (no shame).
 */
export function StreakBadge({ streak, size = "md", showLabel = false }: StreakBadgeProps) {
  const isActive = streak > 0;
  const px = size === "sm" ? 12 : size === "lg" ? 18 : 14;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        isActive ? "text-brand-500" : "text-muted-soft"
      )}
    >
      <Flame size={px} className={isActive ? "fill-current" : ""} />
      <span className={cn("font-semibold tabular-nums", size === "lg" ? "text-base" : "text-xs")}>
        {streak} 天
      </span>
      {showLabel && <span className="text-xs text-muted">连续</span>}
    </span>
  );
}
