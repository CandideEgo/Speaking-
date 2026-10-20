"use client";

import { displayLevel, levelDotClass } from "@/lib/examLevels";
import type { SentenceWord } from "@/lib/sentenceWords";
import { cn } from "@/lib/utils";

/**
 * 本句词条 —— 只出现在桌面句卡的 `desktopActions` 里（移动端齐平字幕带的三行预算
 * 是 INV-021 的硬约束，不放第二行控件）。点词复用页面的 `handleWordClick`，走同一个
 * 词卡；选中态复用 `isSelectedWord`。回调带上触发元素当词卡锚点（桌面词卡不再固定
 * 停在左下、压住一级导航）。
 *
 * 无词时返回 null：桌面上不留一个空的横条，也不改变句卡高度。
 */
export function SentenceWordStrip({
  words,
  targetLevel,
  isSelected,
  onWordClick,
}: {
  words: SentenceWord[];
  targetLevel: string | null;
  isSelected: (word: string) => boolean;
  onWordClick: (word: string, anchor?: HTMLElement | null) => void;
}) {
  if (!words.length) return null;

  return (
    <div
      data-testid="sentence-word-strip"
      className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none"
    >
      <span className="shrink-0 text-caption font-bold uppercase tracking-wider text-muted-soft">
        本句词
      </span>
      {words.map((item) => {
        const meta = displayLevel(item.levels, targetLevel);
        const active = isSelected(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={(e) => {
              // 句卡根节点是播放/暂停热区，词条自己吞掉这次点击（与句内点词同一条规则）。
              e.stopPropagation();
              onWordClick(item.key, e.currentTarget);
            }}
            aria-label={`查看 ${item.label} 的释义`}
            title={meta ? `${item.label} · ${meta.label}` : item.label}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-meta font-semibold transition-colors cursor-pointer",
              active
                ? "border-brand-500/30 bg-brand-50 text-brand-700"
                : "border-hairline bg-canvas text-ink hover:border-brand-500/40 hover:text-brand-700"
            )}
          >
            {meta && <span className={cn("h-1.5 w-1.5 rounded-full", levelDotClass(meta.color))} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
