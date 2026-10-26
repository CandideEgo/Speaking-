"use client";

import { cn } from "@/lib/utils";
import { PROCESSING_STATUS_CONFIG, type StatusBadgeConfig } from "@/lib/videoStatus";

/**
 * 状态小字（A-18）用可读的 `*-text` 语义档：`text-success`（#16a34a）压在
 * `bg-success-soft` 上只有 3.12:1，AA 不达标；配色本身仍来自 `PROCESSING_STATUS_CONFIG`
 * （lib/videoStatus.tsx，用户端/后台共用），这里只把文字档换成语义文字 token，
 * 不改布局、行为与文案。图标沿用同色（随 currentColor）。
 */
const TEXT_TONE: Record<string, string> = {
  "text-success": "text-success-text",
  "text-warning": "text-warning-text",
  "text-error": "text-error-text",
};

function readableTone(className: string): string {
  return className
    .split(/\s+/)
    .map((token) => TEXT_TONE[token] ?? token)
    .join(" ");
}

export function VideoStatusBadge({ status }: { status: string }) {
  const config: StatusBadgeConfig =
    PROCESSING_STATUS_CONFIG[status] || PROCESSING_STATUS_CONFIG.processing;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-meta font-medium",
        readableTone(config.className)
      )}
    >
      <Icon size={14} /> {config.label}
    </span>
  );
}
