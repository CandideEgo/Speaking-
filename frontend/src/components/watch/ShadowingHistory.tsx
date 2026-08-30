"use client";

import { Check, Mic, Trash2 } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import type { ShadowingAttempt } from "@/hooks/useShadowing";

interface ShadowingHistoryProps {
  attempts: ShadowingAttempt[];
  /** Owner-only: when provided, each row shows a delete button. The list
   *  will optimistically remove the row and the parent is expected to
   *  reflect the server state on failure (handled inside useShadowing). */
  onDelete?: (id: string) => void;
}

/**
 * Lightweight inline list of recent shadowing attempts for the current video.
 * When the user has zero attempts, show a tiny guidance line so the section
 * doesn't look broken.
 */
export function ShadowingHistory({ attempts, onDelete }: ShadowingHistoryProps) {
  if (!attempts.length) {
    return (
      <div className="mt-3 pt-3 border-t border-hairline">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">
          最近跟读
        </p>
        <div className="flex items-center gap-2 px-1 py-2 text-[11px] text-muted-soft">
          <Mic size={12} />
          观看视频时可以录音跟读，跟读记录会出现在这里
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-hairline">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">最近跟读</p>
      <div className="space-y-1.5">
        {attempts.map((a) => (
          <div
            key={a.id}
            className="group flex items-center gap-2.5 rounded-lg bg-surface-soft px-3 py-2"
          >
            <audio
              src={mediaUrl(a.audio_url)}
              controls
              className="h-7 flex-1 max-w-[200px]"
              preload="none"
            />
            <span className="text-[11px] text-muted whitespace-nowrap">
              {new Date(a.created_at).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {a.is_satisfied && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-success font-medium">
                <Check size={11} />
                满意
              </span>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                aria-label="删除这条跟读录音"
                title="删除"
                className="inline-flex items-center justify-center w-6 h-6 rounded
                  text-muted-soft opacity-0 group-hover:opacity-100
                  hover:text-danger hover:bg-danger/10
                  focus-visible:opacity-100 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-danger/40
                  transition-[opacity,color,background-color] duration-150"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
