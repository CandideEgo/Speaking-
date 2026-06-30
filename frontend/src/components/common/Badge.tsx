"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "brand"
  | "amber"
  | "orange"
  | "green"
  | "red"
  | "neutral";

const TONE: Record<BadgeTone, string> = {
  brand: "bg-brand-50 text-brand-600",
  amber: "bg-amber-50 text-amber-700",
  orange: "bg-orange-50 text-orange-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-600",
  neutral: "bg-surface-soft text-muted-foreground",
};

/**
 * Small status pill. Consolidates the ad-hoc `inline-flex rounded-sm px-2
 * py-0.5 text-[10px] font-medium` badges that were copy-pasted (with per-page
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
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-medium",
        TONE[tone],
        className,
      )}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}
