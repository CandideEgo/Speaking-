"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SheetHandle, SHEET_CLOSE_DRAG_PX } from "@/components/watch/SheetHandle";
import type { SubtitleFontSize } from "@/components/watch/VideoControls";
import { type SubtitleMode } from "@/stores/watchStore";

/**
 * WatchMoreSheet — 移动端的 ⋯ 面板：把首屏那 355px 次要信息收进一张底部抽屉
 * （DEC-069 / #31 第 6 条）。
 *
 *     ┌───────────────────────────────────────────┐
 *     │                  ▁▁▁▁                     │ 下拉 >64px 关
 *     │  语言   [双语] [英语] [中文]              │
 *     │  字幕字号  [小] [中] [大]                 │
 *     │  播放倍速  [0.5x] [0.75x] [1x] …          │
 *     │  出处 + 版权声明                          │
 *     │  点赞 · 收藏 · 加入学习 · 单词训练 · 笔记  │ ← 页头的动作行
 *     └───────────────────────────────────────────┘
 *
 * 形态复用 `SheetHandle` + 下拉关闭手势（与 `WordCardSheet` / `ShadowingDrawer` 同一套），
 * 但它不引用画框：它锚的是**可视区底边**（`position: fixed`，尺寸自己撑），不是 `main` 里的
 * 绝对定位层 —— 所以不参与 `useSheetGeometry` 那套「上沿 = 画框下沿」的约束。
 * 跟读抽屉与词卡是**页面的浮层**（要贴画框），这一张是**页面的面板**（可以铺到屏底）。
 */
export function WatchMoreSheet({
  open,
  onClose,
  subtitleMode,
  onSubtitleModeChange,
  fontSize,
  onFontSizeChange,
  rates,
  rate,
  onRateChange,
  sourceUrl,
  actions,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  subtitleMode: SubtitleMode;
  onSubtitleModeChange: (mode: SubtitleMode) => void;
  fontSize: SubtitleFontSize;
  onFontSizeChange: (size: SubtitleFontSize) => void;
  rates: readonly number[];
  rate: number;
  onRateChange: (rate: number) => void;
  /** 原视频来源（ICP 合规）。没有来源（自有内容）就只留版权声明那一行。 */
  sourceUrl: string | null;
  /** 点赞/收藏/加入学习/单词训练/笔记 —— 由页面构造（复用页头那一行）。 */
  actions: ReactNode;
  /** 笔记编辑区等页面自带的补充内容。 */
  extra?: ReactNode;
}) {
  const [dy, setDy] = useState(0);
  if (!open) return null;

  return (
    <div data-testid="watch-more-sheet" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-label="更多设置"
        style={{ transform: dy ? `translateY(${dy}px)` : undefined }}
        className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-2xl border-t border-hairline bg-canvas pb-4 shadow-lift"
      >
        <SheetHandle
          testId="watch-more-grab"
          onDrag={setDy}
          onRelease={(d) => {
            setDy(0);
            if (d > SHEET_CLOSE_DRAG_PX) onClose();
          }}
        />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-1">
          <Row label="语言">
            {(
              [
                ["bilingual", "双语"],
                ["english", "英语"],
                ["chinese", "中文"],
              ] as [SubtitleMode, string][]
            ).map(([key, label]) => (
              <Chip
                key={key}
                active={subtitleMode === key}
                onClick={() => onSubtitleModeChange(key)}
              >
                {label}
              </Chip>
            ))}
          </Row>

          <Row label="字幕字号">
            {(
              [
                ["small", "小"],
                ["medium", "中"],
                ["large", "大"],
              ] as [SubtitleFontSize, string][]
            ).map(([key, label]) => (
              <Chip key={key} active={fontSize === key} onClick={() => onFontSizeChange(key)}>
                {label}
              </Chip>
            ))}
          </Row>

          <Row label="播放倍速">
            {rates.map((r) => (
              <Chip key={r} active={rate === r} mono onClick={() => onRateChange(r)}>
                {r}x
              </Chip>
            ))}
          </Row>

          {extra}

          <div className="rounded-lg border border-hairline px-3 py-2.5">
            {sourceUrl ? (
              <p className="text-[13px] text-muted">
                原视频来源：YouTube ·{" "}
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 font-medium hover:underline"
                >
                  {sourceUrl.replace(/^https?:\/\//, "")}
                </a>
              </p>
            ) : (
              <p className="text-[13px] text-muted">本视频由 SeeWord 提供</p>
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-soft">
              内容仅供学习交流使用，版权归原作者所有。如有侵权请联系我们删除。
            </p>
          </div>

          <div className="border-t border-hairline pt-3">{actions}</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-muted-soft">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  mono,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-[13px] font-medium transition-colors cursor-pointer",
        mono && "font-mono",
        active
          ? "bg-brand-500 text-white"
          : "bg-surface-soft text-muted hover:bg-hairline hover:text-ink"
      )}
    >
      {children}
      {active && <Check size={12} />}
    </button>
  );
}
