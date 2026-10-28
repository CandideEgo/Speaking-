"use client";

import { useEffect, useState, type RefObject } from "react";

export interface SheetGeometry {
  /** 当前句卡下沿（视口坐标）—— 浮层顶边。找不到句卡时退回画框下沿。 */
  anchorBottom: number;
  /** 壳最后一行常规流底栏的上沿（视口坐标）—— 浮层底边。 */
  bottom: number;
}

/**
 * 词卡让出常驻播放操作与五项导航；桌面导航隐藏时退回可视区底边。
 */
const TAB_BAR_SELECTOR = '[data-testid="mobile-tab-bar"]';
const PLAYBACK_BAR_SELECTOR = '[data-shell-bottom-bar="watch"]';
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
      const bar = ['[data-immersive-tools="true"]', PLAYBACK_BAR_SELECTOR, TAB_BAR_SELECTOR]
        .map((selector) => document.querySelector(selector))
        .find((candidate) => candidate?.getClientRects().length);
      const viewportBottom = window.visualViewport
        ? Math.min(
            window.innerHeight,
            window.visualViewport.height + window.visualViewport.offsetTop
          )
        : window.innerHeight;
      const barTop = bar ? bar.getBoundingClientRect().top : viewportBottom;
      // 底栏可能被安全区推高；夹一下，别让浮层底边跑到可视区外。
      const bottom = Math.min(Math.max(barTop, 0), viewportBottom);
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
    window.visualViewport?.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    const card = document.querySelector('[data-testid="current-sentence-card"]');
    if (card) observer.observe(card);
    if (anchorRef.current) observer.observe(anchorRef.current);
    const main = anchorRef.current?.closest("main");
    if (main) observer.observe(main);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [anchorRef, open]);

  return geo;
}
