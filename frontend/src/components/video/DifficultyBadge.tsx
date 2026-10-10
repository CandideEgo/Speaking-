"use client";

import { cn } from "@/lib/utils";
import { cefrExamHint } from "@/lib/cefrLevels";

/** 已知 CEFR 档位白名单（历史脏值如 "CR" 不渲染）。 */
const KNOWN_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

/** S8-1 颜色收敛：等级是**被动信息**，用中性一套（surface-card + body）；
 *  主色留给动作/强调。原先 A1–C2 四族色（success/indigo/warning/red）与
 *  筛选栏、药丸的中性语言不一致，且四族色让全站调色板膨胀。 */
const BADGE_CLASS = "bg-surface-card text-body";

export interface DifficultyBadgeProps {
  /** CEFR level string (A1–C2). Renders nothing when null/empty. */
  level: string | null | undefined;
  /** Size variant: sm = VideoCard overlay, md = watch page / detail. */
  size?: "sm" | "md";
  /** Additional className. */
  className?: string;
}

/**
 * Shared CEFR difficulty badge used across VideoCard, SearchDropdown,
 * watch page, and admin views.
 */
export function DifficultyBadge({ level, size = "sm", className }: DifficultyBadgeProps) {
  // 白名单清洗：历史脏值（如 "CR"）不渲染，避免卡片透出无意义徽章。
  if (!level || !KNOWN_LEVELS.has(level)) return null;

  // CEFR 附考试体系对照（与引导/筛选/高亮统一语言），hover 可见。
  const hint = cefrExamHint(level);

  return (
    <span
      className={cn(
        "inline-block font-bold rounded-pill",
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        BADGE_CLASS,
        className
      )}
      title={hint ? `${level} · ≈${hint}` : undefined}
    >
      {level}
    </span>
  );
}
