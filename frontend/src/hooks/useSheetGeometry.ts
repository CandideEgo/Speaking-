"use client";

import { useEffect, useState, type RefObject } from "react";

export interface SheetGeometry {
  /** 当前句卡下沿（视口坐标）—— 浮层顶边。找不到句卡时退回画框下沿。 */
  anchorBottom: number;
  /** 壳最后一行常规流底栏的上沿（视口坐标）—— 浮层底边。 */
  bottom: number;
}

/**
 * 手机的壳底部始终是五项全站导航；观看操作位于页面内容中，不参与浮层定位。
 * 桌面导航隐藏时，退回可视区底边。
 */
const TAB_BAR_SELECTOR = '[data-testid="mobile-tab-bar"]';
/** 画框量不到时的兜底顶边（视口底往上 400px ≈ 半屏，见 #26 决议的默认档）。 */
const FALLBACK_HEIGHT = 400;
/** 浮层最少留这么多高度，避免极短视口下把内容全挤没。 */
const MIN_SHEET_HEIGHT = 240;

/**
 * 移动端浮层锚点 —— #27（词卡贴画面下沿）与 #26（跟读底部抽屉）共用同一条线。
 *
 * 底边钉在**壳的最后一行常规流底栏**上沿：底栏是壳的常规流收尾行，天然贴住可视区底边
 * 所以浮层不会压住导航。顶边优先取当前句卡下沿；短视口至少留出 240px 供操作。
 * 句卡尚未渲染时退回画框下沿，再退到屏高兜底。
 *
 * 滚动监听必须走捕获阶段：播放页滚的是壳里的 <main>，scroll 事件不冒泡。
 */
export function useSheetGeometry(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean
): SheetGeometry | null {
  const [geo, setGeo] = useState<SheetGeometry | null>(null);

  useEffect(() => {
    if (!open) {
      setGeo(null);
      return;
    }

    let raf = 0;

    const measure = () => {
      const candidate = document.querySelector(TAB_BAR_SELECTOR);
      const bar = candidate?.getClientRects().length ? candidate : null;
      const viewportBottom = window.innerHeight;
      const barTop = bar ? bar.getBoundingClientRect().top : viewportBottom;
      // 底栏可能被安全区推高；夹一下，别让浮层底边跑到可视区外。
      const bottom = Math.min(Math.max(barTop, MIN_SHEET_HEIGHT), viewportBottom);
      const sentenceCard = document.querySelector('[data-testid="current-sentence-card"]');
      const frame = anchorRef.current?.getBoundingClientRect();
      const anchorBottom = Math.min(
        sentenceCard
          ? sentenceCard.getBoundingClientRect().bottom
          : frame
            ? frame.bottom
            : bottom - FALLBACK_HEIGHT,
        Math.max(0, bottom - MIN_SHEET_HEIGHT)
      );
      setGeo((prev) =>
        prev &&
        Math.abs(prev.anchorBottom - anchorBottom) < 0.5 &&
        Math.abs(prev.bottom - bottom) < 0.5
          ? prev
          : { anchorBottom, bottom }
      );
    };

    // 滚动/旋转/地址栏收放都会改这两个读数，rAF 合并成每帧一次。
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };

    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [anchorRef, open]);

  return geo;
}
