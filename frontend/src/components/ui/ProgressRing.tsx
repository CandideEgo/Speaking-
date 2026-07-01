"use client";

interface ProgressRingProps {
  /** 0–1 progress value */
  progress: number;
  /** Ring size in px (default 36) */
  size?: number;
  /** Stroke width in px (default 3) */
  strokeWidth?: number;
  /** Track color (Tailwind text-* class applied via `stroke="currentColor"`) */
  trackClass?: string;
  /** Fill color when not met — CSS color string (default "#cc785c") */
  fillActive?: string;
  /** Fill color when met — CSS color string (default "#22c55e") */
  fillMet?: string;
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
  fillActive = "#cc785c",
  fillMet = "#22c55e",
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
          stroke={isMet ? fillMet : fillActive}
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
