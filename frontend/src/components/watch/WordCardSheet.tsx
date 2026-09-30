"use client";

import { useEffect, useState, type RefObject } from "react";
import { WordCardBody } from "@/components/subtitle/WordTooltipInline";
import { SheetHandle, SHEET_CLOSE_DRAG_PX } from "@/components/watch/SheetHandle";
import { useSheetGeometry } from "@/hooks/useSheetGeometry";
import { cn } from "@/lib/utils";
import type { WordGloss } from "@/types";

/** 词卡再矮就没有阅读价值；矮到这份上宁可贴着画框下沿顶到满。 */
const MIN_SHEET_HEIGHT = 240;

/**
 * WordCardSheet — 移动端词卡：**贴着画面下沿升起的浮层**（#27 决议乙）。
 *
 * 卡口＝画框下沿（#28 撤掉常驻控制条后的复议结论）：顶边就是入画字幕的下沿，
 * 断层 0px，因此它盖住的全是画面**以下**的内容（伴侣条 / 文稿列表），
 * 永远压不到刚点的那一句 —— 票面那条硬约束在结构上成立。
 *
 * **高度随内容**（原型 W2-edge 实测：`top:255px` 只给 top、卡高由内容决定，
 * `max-height` 497 封顶），只在内容够高时才一路撑到底栏上沿。早先实现写死
 * `height = 底栏顶 - 顶边`，把卡拉成 408px 的满屏白板、底下的文稿列表一句都看不见 ——
 * 与「从画面下沿升起、盖住字幕条与文稿列表**顶部**」的票面描述不符。
 * 底边仍不越过移动底栏上沿（`useSheetGeometry` 给的就是底栏顶）。
 */
export function WordCardSheet({
  anchorRef,
  word,
  gloss,
  onClose,
  onPronounce,
  onSave,
}: {
  /** 画框元素（视频槽位）—— 词卡顶边的锚。 */
  anchorRef: RefObject<HTMLElement | null>;
  word: string;
  gloss: WordGloss | null;
  onClose: () => void;
  onPronounce: () => void;
  onSave: () => Promise<void>;
}) {
  const geo = useSheetGeometry(anchorRef, true);
  const [dy, setDy] = useState(0);
  const [entered, setEntered] = useState(false);

  // 换词时把下拉位移清零，避免上一次拖到一半的状态留着。
  useEffect(() => {
    setDy(0);
  }, [word]);

  useEffect(() => {
    if (!geo) return;
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [geo]);

  if (!geo) return null;

  const top = Math.max(8, Math.min(geo.frameBottom, geo.bottom - MIN_SHEET_HEIGHT));
  const maxHeight = Math.max(MIN_SHEET_HEIGHT, geo.bottom - top);

  return (
    <div
      data-testid="word-tooltip"
      data-variant="sheet"
      role="dialog"
      aria-label={`${word} 词卡`}
      style={{ top, maxHeight, transform: dy ? `translateY(${dy}px)` : undefined }}
      className={cn(
        "fixed inset-x-0 z-50 flex flex-col overflow-hidden bg-canvas",
        "rounded-t-2xl border-t border-hairline shadow-lift",
        entered ? "opacity-100" : "opacity-0",
        dy === 0 && "transition-[transform,opacity] duration-200 ease-out"
      )}
    >
      <SheetHandle
        testId="word-card-grab"
        onDrag={setDy}
        onRelease={(d) => {
          setDy(0);
          if (d > SHEET_CLOSE_DRAG_PX) onClose();
        }}
      />
      <WordCardBody
        word={word}
        gloss={gloss}
        onClose={onClose}
        onPronounce={onPronounce}
        onSave={onSave}
        scrollClassName="flex-1 min-h-0 max-h-none"
        touchTargets
      />
    </div>
  );
}
