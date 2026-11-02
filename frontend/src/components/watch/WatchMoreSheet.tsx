"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { Check, X } from "lucide-react";
import { useOverlayContainer } from "@/hooks/useOverlayContainer";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerPopup,
  DrawerPortal,
  DrawerViewport,
  DrawerVirtualKeyboardProvider,
} from "@/components/ui/Drawer";
import { SheetHandle, SHEET_CLOSE_DRAG_PX } from "@/components/watch/SheetHandle";
import type { SubtitleFontSize } from "@/components/watch/VideoControls";
import { type SubtitleMode } from "@/stores/watchStore";
import { SUBTITLE_MODE_LABEL, SUBTITLE_MODE_ORDER } from "@/lib/subtitleModes";

/**
 * WatchMoreSheet — 移动端的 ⋯ 面板：把首屏那 355px 次要信息收进一张底部抽屉
 * （DEC-069 / #31 第 6 条）。
 *
 *     ┌───────────────────────────────────────────┐
 *     │                  ▁▁▁▁                     │ 下拉关闭（整卡手势）
 *     │  语言   [双语] [英文] [中文] [关闭]       │
 *     │  字幕字号  [小] [中] [大]                 │
 *     │  播放倍速  [0.5x] [0.75x] [1x] …          │
 *     │  出处 + 版权声明                          │
 *     │  点赞 · 收藏 · 加入学习 · 单词训练 · 笔记  │ ← 页头的动作行
 *     └───────────────────────────────────────────┘
 *
 * 外壳是 `ui/Drawer`（Base UI Drawer）：焦点陷阱、滚动锁、背景 inert、Escape、
 * 外点关闭与下拉手势都由原语负责，不再用 `useModalFocus` 手写。它锚的是**可视区
 * 底边**，不引用画框——所以不参与 `useSheetGeometry` 那套「上沿 = 画框下沿」的
 * 约束。词卡是**页面的浮层**（要贴画框），这一张是**页面的面板**（铺到屏底）。
 *
 * 顶部那根把手现在只保留视觉与键盘关闭（Enter/Space）：指针下拉整张卡片都已由
 * 原语接管，把手再拖一次会跟它抢同一个手势。
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
  triggerRef,
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
  /** 打开它的那个 ⋯ 按钮：关闭后焦点回到这里。 */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const container = useOverlayContainer();
  const grabRef = useRef<HTMLDivElement>(null);

  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerVirtualKeyboardProvider>
        <DrawerPortal container={container}>
          <DrawerBackdrop />
          <DrawerViewport>
            <DrawerPopup
              data-testid="watch-more-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="更多设置"
              // 打开后的首焦点落在把手上（与改造前一致），关闭后回到 ⋯ 按钮。
              initialFocus={grabRef}
              finalFocus={triggerRef ?? true}
            >
              <SheetHandle
                testId="watch-more-grab"
                handleRef={grabRef}
                dragEnabled={false}
                onDrag={() => {}}
                onRelease={(d) => {
                  if (d > SHEET_CLOSE_DRAG_PX) onClose();
                }}
              />
              <div className="flex shrink-0 items-center justify-between px-4">
                <h2 className="text-copy font-semibold text-ink">更多设置</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="关闭更多设置"
                  className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-ink"
                >
                  <X size={20} />
                </button>
              </div>
              <DrawerContent className="space-y-4 px-4 pt-1">
                <Row label="语言">
                  {SUBTITLE_MODE_ORDER.map((key) => (
                    <Chip
                      key={key}
                      active={subtitleMode === key}
                      onClick={() => onSubtitleModeChange(key)}
                    >
                      {SUBTITLE_MODE_LABEL[key]}
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
                    <p className="text-copy text-muted">
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
                    <p className="text-copy text-muted">本视频由 SeeWord 提供</p>
                  )}
                  <p className="mt-1.5 text-caption leading-relaxed text-muted-soft">
                    内容仅供学习交流使用，版权归原作者所有。如有侵权请联系我们删除。
                  </p>
                </div>

                <div className="border-t border-hairline pt-3">{actions}</div>
              </DrawerContent>
            </DrawerPopup>
          </DrawerViewport>
        </DrawerPortal>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-caption text-muted-soft">{label}</p>
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
        "inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-copy font-medium transition-colors cursor-pointer",
        mono && "font-mono",
        active
          ? "bg-action-primary text-on-primary"
          : "bg-surface-soft text-muted hover:bg-hairline hover:text-ink"
      )}
    >
      {children}
      {active && <Check size={12} />}
    </button>
  );
}
