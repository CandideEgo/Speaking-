"use client";

import { useEffect, useState, type RefObject } from "react";

export interface SheetGeometry {
  /** 画框下沿（视口坐标）—— 浮层顶边的天然上限：越过它就压住入画字幕。 */
  frameBottom: number;
  /** 移动底栏上沿（视口坐标）—— 浮层底边。 */
  bottom: number;
}

const TAB_BAR_SELECTOR = '[data-testid="mobile-tab-bar"]';
/** 画框量不到时的兜底顶边（视口底往上 400px ≈ 半屏，见 #26 决议的默认档）。 */
const FALLBACK_HEIGHT = 400;
/** 浮层最少留这么多高度，避免极短视口下把内容全挤没。 */
const MIN_SHEET_HEIGHT = 120;

/**
 * 移动端浮层锚点 —— #27（词卡贴画面下沿）与 #26（跟读底部抽屉）共用同一条线。
 *
 * 底边钉在移动底栏上沿：底栏是壳的常规流收尾行，天然贴住可视区底边（INV-019），
 * 所以浮层不会压住底栏，也不会被 iOS 地址栏拽出可视区。
 * 顶边由调用方按「画框下沿」或「屏高」给，本钩子只负责这两个读数本身。
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
      const bar = document.querySelector(TAB_BAR_SELECTOR);
      const viewportBottom = window.innerHeight;
      const barTop = bar ? bar.getBoundingClientRect().top : viewportBottom;
      // 底栏可能被安全区推高；夹一下，别让浮层底边跑到可视区外。
      const bottom = Math.min(Math.max(barTop, MIN_SHEET_HEIGHT), viewportBottom);
      const frame = anchorRef.current?.getBoundingClientRect();
      const frameBottom = Math.min(frame ? frame.bottom : bottom - FALLBACK_HEIGHT, bottom);
      setGeo((prev) =>
        prev &&
        Math.abs(prev.frameBottom - frameBottom) < 0.5 &&
        Math.abs(prev.bottom - bottom) < 0.5
          ? prev
          : { frameBottom, bottom }
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
