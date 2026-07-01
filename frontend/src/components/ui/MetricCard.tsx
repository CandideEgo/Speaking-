"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone =
  | "default"
  | "brand"
  | "success"
  | "warning"
  | "indigo"
  | "coral"
  | "teal"
  | "amber"
  | "purple"
  | "blue";

const TONE_MAP: Record<
  Tone,
  { icon: string; value?: string; border?: string }
> = {
  default: { icon: "bg-cream-soft text-muted", value: "text-ink" },
  brand: {
    icon: "bg-brand-50 text-brand-500",
    value: "text-brand-500",
    border: "border-brand-100",
  },
  success: {
    icon: "bg-success-soft text-success",
    value: "text-success",
    border: "border-success-soft",
  },
  warning: {
    icon: "bg-warning-soft text-warning",
    value: "text-warning",
    border: "border-warning-soft",
  },
  indigo: {
    icon: "bg-indigo-soft text-indigo",
  },
  coral: {
    icon: "bg-coral/10 text-coral",
  },
  teal: {
    icon: "bg-teal/10 text-teal",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
  },
  purple: {
    icon: "bg-purple-50 text-purple-600",
  },
  blue: {
    icon: "bg-blue-50 text-blue-600",
  },
};

interface MetricCardProps {
  /** Metric icon */
  icon: LucideIcon;
  /** Metric label */
  label: string;
  /** Metric value — number or formatted string */
  value: string | number;
  /** Optional suffix appended to value (e.g. "%") */
  suffix?: string;
  /** Color tone — controls icon background, value color, border accent */
  tone?: Tone;
  /** Layout variant:
   *  "icon-top" — large icon above number (dashboard style, default)
   *  "label-top" — small icon + label row above number (vocabulary style)
   */
  variant?: "icon-top" | "label-top";
  /** Override container className */
  className?: string;
}

/**
 * Unified metric/stat card.
 * Replaces the `dash-stat` and `stat-card` CSS patterns.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  suffix,
  tone = "default",
  variant = "icon-top",
  className,
}: MetricCardProps) {
  const t = TONE_MAP[tone];

  if (variant === "label-top") {
    return (
      <div
        className={cn(
          "bg-canvas rounded-lg p-5 border border-hairline hover:shadow-soft transition-all duration-150",
          t.border && `!${t.border}`,
          className,
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 text-xs font-semibold mb-2",
            t.value ?? "text-muted",
          )}
        >
          <Icon size={14} /> {label}
        </div>
        <div
          className={cn(
            "text-[28px] font-extrabold tracking-display-md",
            t.value ?? "text-ink",
          )}
        >
          {value}
          {suffix}
        </div>
      </div>
    );
  }

  // variant === "icon-top"
  return (
    <div
      className={cn(
        "bg-canvas border border-hairline rounded-lg p-[22px] hover:shadow-soft transition-all duration-150",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3.5">
        <div
          className={cn(
            "w-[38px] h-[38px] rounded-[10px] flex items-center justify-center",
            t.icon,
          )}
        >
          <Icon size={19} />
        </div>
      </div>
      <div
        className={cn(
          "text-[30px] font-extrabold tracking-display-lg leading-none",
          t.value ?? "text-ink",
        )}
      >
        {value}
        {suffix}
      </div>
      <div className="text-[13px] text-muted mt-1">{label}</div>
    </div>
  );
}
