"use client";

import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  ready: {
    icon: <CheckCircle2 size={14} className="text-green-600" />,
    label: "就绪",
    className: "bg-green-50 text-green-700",
  },
  ready_subtitles: {
    icon: <Loader2 size={14} className="animate-spin text-amber-500" />,
    label: "视频处理中",
    className: "bg-amber-50 text-amber-700",
  },
  error: {
    icon: <AlertCircle size={14} className="text-red-500" />,
    label: "失败",
    className: "bg-red-50 text-red-700",
  },
  processing: {
    icon: <Loader2 size={14} className="animate-spin text-amber-500" />,
    label: "处理中",
    className: "bg-amber-50 text-amber-700",
  },
};

export function VideoStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.processing;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium",
        config.className
      )}
    >
      {config.icon} {config.label}
    </span>
  );
}
