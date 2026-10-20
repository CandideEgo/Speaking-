"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeTone = "brand" | "amber" | "green" | "red" | "neutral";

// 文字用「文字专用加深档」：主色（brand-600 / warning / success / error）是给
// 填充与圆点用的，12px 小字压在 soft 底上不足 4.5:1；这里换成
// brand-800 / *-text（设计 shared/page.css 的 --ok/--warn/--err-text 同值）。
const TONE: Record<BadgeTone, string> = {
  brand: "bg-brand-50 text-brand-800",
  amber: "bg-warning-soft text-warning-text",
  green: "bg-success-soft text-success-text",
  red: "bg-red-soft text-error-text",
  neutral: "bg-surface-soft text-muted",
};

/**
 * Small status pill. Consolidates the ad-hoc `inline-flex rounded-sm px-2
 * py-0.5 text-caption font-medium` badges that were copy-pasted (with per-page
 * color maps) across admin pages. Tone palette mirrors `StatCard`.
 */
export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-medium",
        TONE[tone],
        className
      )}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}
