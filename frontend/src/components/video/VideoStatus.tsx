"use client";

import { cn } from "@/lib/utils";
import {
  PROCESSING_STATUS_CONFIG,
  type StatusBadgeConfig,
} from "@/lib/videoStatus";

export function VideoStatusBadge({ status }: { status: string }) {
  const config: StatusBadgeConfig =
    PROCESSING_STATUS_CONFIG[status] || PROCESSING_STATUS_CONFIG.processing;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium",
        config.className,
      )}
    >
      <Icon size={14} /> {config.label}
    </span>
  );
}
