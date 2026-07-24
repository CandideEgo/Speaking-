"use client";

import { Check } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import type { ShadowingAttempt } from "@/hooks/useShadowing";

interface ShadowingHistoryProps {
  attempts: ShadowingAttempt[];
}

/**
 * Lightweight inline list of recent shadowing attempts for the current video.
 * Renders nothing when there are no attempts (zero visual noise).
 */
export function ShadowingHistory({ attempts }: ShadowingHistoryProps) {
  if (!attempts.length) return null;

  return (
    <div className="mt-3 pt-3 border-t border-hairline">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">最近跟读</p>
      <div className="space-y-1.5">
        {attempts.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2.5 rounded-lg bg-surface-soft px-3 py-2"
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
          </div>
        ))}
      </div>
    </div>
  );
}
