"use client";

import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0–1 progress value */
  progress: number;
  /** Ring size in px (default 36) */
  size?: number;
  /** Stroke width in px (default 3) */
  strokeWidth?: number;
  /** Track color class (Tailwind text-* token applied via `stroke="currentColor"`) */
  trackClass?: string;
  /** Fill color class while in progress (default `text-brand-500`) */
  fillClass?: string;
  /** Fill color class when met (default `text-success`) */
  metClass?: string;
  /** Whether the goal is met */
  isMet?: boolean;
  /** Optional label rendered in the center */
  label?: React.ReactNode;
}

export function ProgressRing({
  progress,
  size = 36,
  strokeWidth = 3,
  trackClass = "text-hairline",
  fillClass = "text-brand-500",
  metClass = "text-success",
  isMet = false,
  label,
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className={trackClass}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className={cn(isMet ? metClass : fillClass)}
          strokeWidth={strokeWidth}
          strokeDasharray={`${clampedProgress * circumference} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-ink">
          {label}
        </span>
      )}
    </div>
  );
}
