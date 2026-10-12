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
  /**
   * "list"（默认）：原样的「最近跟读」列表——移动端跟读抽屉在用，**行为一字不动**。
   * "chips"：S5 桌面动作带用的紧凑形态——最多 3 条、横排 chip；0 条时整块返回
   * null（动作带里不留「暂无记录」空盒子）。
   */
  variant?: "list" | "chips";
}

/**
 * Lightweight inline list of recent shadowing attempts for the current video.
 * When the user has zero attempts, show a tiny guidance line so the section
 * doesn't look broken.
 */
export function ShadowingHistory({ attempts, onDelete, variant = "list" }: ShadowingHistoryProps) {
  if (variant === "chips") {
    // S5：桌面动作带里的紧凑形态。不复用 list 版的行（那是移动端抽屉的尺寸），
    // 也不复用它的空态（动作带上方已有「录音本句」段，不需要引导文案）。
    // audio 保留原生控件——项目禁忌是「不手写第四套播放控件」，缩窄即可。
    const shown = attempts.slice(0, 3);
    if (!shown.length) return null;
    return (
      // `mt-3` 归自己：这个形态只用在桌面动作带里，与上方动作带/展开区保持 12px 节奏；
      // 0 条时整个 return null，不会留下空隙。
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted shrink-0">
          最近跟读
        </span>
        {shown.map((a) => (
          <div
            key={a.id}
            className="group flex items-center gap-1.5 rounded-pill bg-surface-soft pl-1 pr-1.5 py-0.5"
          >
            <audio src={mediaUrl(a.audio_url)} controls className="h-6 w-[170px]" preload="none" />
            <span className="text-caption text-muted whitespace-nowrap">
              {new Date(a.created_at).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {a.is_satisfied && (
              <span className="inline-flex items-center text-success" title="已标记满意">
                <Check size={11} />
              </span>
            )}
            {onDelete && (
              // chips 只出现在桌面动作带（lg+），无触屏场景，可以走 hover 显现。
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                aria-label="删除这条跟读录音"
                title="删除"
                className="inline-flex items-center justify-center w-6 h-6 rounded-md
                  text-muted-soft opacity-0 group-hover:opacity-100
                  hover:text-error hover:bg-error/10
                  focus-visible:opacity-100 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-error/40
                  transition-[opacity,color,background-color] duration-150"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (!attempts.length) {
    return (
      <div className="mt-3 pt-3 border-t border-hairline">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted mb-2">
          最近跟读
        </p>
        <div className="flex items-center gap-2 px-1 py-2 text-caption text-muted-soft">
          <Mic size={12} />
          观看视频时可以录音跟读，跟读记录会出现在这里
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-hairline">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted mb-2">最近跟读</p>
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
            <span className="text-caption text-muted whitespace-nowrap">
              {new Date(a.created_at).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {a.is_satisfied && (
              <span className="inline-flex items-center gap-0.5 text-caption text-success font-medium">
                <Check size={11} />
                满意
              </span>
            )}
            {onDelete && (
              // 触屏上没有 hover：移动端常驻 44px 删除键，桌面端才保留 hover 才现身的克制样式。
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                aria-label="删除这条跟读录音"
                title="删除"
                className="inline-flex items-center justify-center w-11 h-11 md:w-6 md:h-6 rounded-md
                  text-muted-soft opacity-100 md:opacity-0 md:group-hover:opacity-100
                  hover:text-error hover:bg-error/10
                  focus-visible:opacity-100 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-error/40
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
