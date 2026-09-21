"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { cefrExamHint } from "@/lib/cefrLevels";

/** CEFR level → color token mapping. */
const LEVEL_COLORS: Record<string, string> = {
  A1: "bg-success-soft text-success",
  A2: "bg-success-soft text-success",
  B1: "bg-indigo-soft text-indigo",
  B2: "bg-warning-soft text-warning",
  C1: "bg-red-soft text-error",
  C2: "bg-red-soft text-error",
};

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
  // 白名单清洗：历史脏值（如 "CR"）不渲染，避免卡片透出无意义徽章。
  if (!level || !LEVEL_COLORS[level]) return null;

  const color = LEVEL_COLORS[level];
  // CEFR 附考试体系对照（与引导/筛选/高亮统一语言），hover 可见。
  const hint = cefrExamHint(level);

  return (
    <span
      className={cn(
        "inline-block font-bold rounded-pill",
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        color,
        className
      )}
      style={style}
      title={hint ? `${level} · ≈${hint}` : undefined}
    >
      {level}
    </span>
  );
}
