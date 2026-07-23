"use client";

import { GitFork } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small badge shown when a video is forked from a standard version.
 *
 * Usage: <ForkBadge forkedFrom={video.forked_from} size="sm" />
 */
export function ForkBadge({
  forkedFrom,
  size = "sm",
  className,
}: {
  forkedFrom: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!forkedFrom) return null;

  const iconSize = size === "sm" ? 10 : 12;
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-pill bg-brand-50 text-brand-600 px-1.5 py-0.5",
        textSize,
        className
      )}
      title="基于标准版"
    >
      <GitFork size={iconSize} />
      标准版
    </span>
  );
}
