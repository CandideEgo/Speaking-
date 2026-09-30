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
 * 底边钉在移动底栏上沿（不盖底栏，见 `useSheetGeometry`）。
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
  const height = Math.max(MIN_SHEET_HEIGHT, geo.bottom - top);

  return (
    <div
      data-testid="word-tooltip"
      data-variant="sheet"
      role="dialog"
      aria-label={`${word} 词卡`}
      style={{ top, height, transform: dy ? `translateY(${dy}px)` : undefined }}
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
