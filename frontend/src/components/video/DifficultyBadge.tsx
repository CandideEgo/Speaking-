"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** CEFR level → color token mapping. */
const LEVEL_COLORS: Record<string, string> = {
  A1: "bg-success-soft text-success",
  A2: "bg-success-soft text-success",
  B1: "bg-indigo-soft text-indigo",
  B2: "bg-warning-soft text-warning",
  C1: "bg-red-soft text-error",
  C2: "bg-red-soft text-error",
};

const FALLBACK_COLOR = "bg-surface-card text-muted";

export interface DifficultyBadgeProps {
  /** CEFR level string (A1–C2). Renders nothing when null/empty. */
  level: string | null | undefined;
  /** Size variant: sm = VideoCard overlay, md = watch page / detail. */
  size?: "sm" | "md";
  /** Additional className. */
  className?: string;
  /** Inline style (e.g. for overlay background on thumbnails). */
  style?: CSSProperties;
}

/**
 * Shared CEFR difficulty badge used across VideoCard, SearchDropdown,
 * watch page, and admin views.
 */
export function DifficultyBadge({ level, size = "sm", className, style }: DifficultyBadgeProps) {
  if (!level) return null;

  const color = LEVEL_COLORS[level] || FALLBACK_COLOR;

  return (
    <span
      className={cn(
        "inline-block font-bold rounded-pill",
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        color,
        className
      )}
      style={style}
    >
      {level}
    </span>
  );
}
