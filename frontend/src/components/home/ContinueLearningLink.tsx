"use client";

import Link from "next/link";
import { CirclePlay } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { watchHref } from "@/lib/watchEntry";
import type { ContinueLearningState } from "@/hooks/useContinueLearning";

export function ContinueLearningLink({ state }: { state: ContinueLearningState }) {
  const { record, failed, retry } = state;
  if (failed)
    return (
      <div role="status" className="mb-4 flex flex-wrap items-center gap-2 text-meta text-muted">
        观看记录暂时未能加载
        <Button variant="text" size="compact" onClick={retry}>
          重试
        </Button>
      </div>
    );
  if (!record) return null;
  const position = Number.isFinite(record.position_seconds)
    ? Math.max(0, Math.floor(record.position_seconds))
    : 0;
  return (
    <Link
      data-testid="continue-learning-rail"
      href={watchHref(record.video_id, { from: "home", extra: { t: position } })}
      className="mb-4 flex min-h-11 items-center gap-2 rounded-md border border-hairline px-3 py-2 text-meta text-body hover:bg-surface-soft"
    >
      <CirclePlay size={18} className="shrink-0" aria-hidden />
      <span className="shrink-0 font-semibold">继续观看</span>
      <span className="min-w-0 truncate">
        {record.video?.title_zh?.trim() || record.video?.title || "上一段视频"}
      </span>
      <span className="ml-auto shrink-0 tabular-nums text-muted">
        {Math.min(100, Math.max(0, Math.round(record.progress_percentage || 0)))}%
      </span>
    </Link>
  );
}
