"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

interface StickyPipResult {
  /**
   * True when the slot has scrolled out of the top portion of the viewport and
   * the user has not dismissed the mini-player. Use this to toggle the
   * media wrapper between its in-flow and fixed (mini-player) styles.
   */
  isPip: boolean;
  /** Hide the mini-player until the slot scrolls back into view (re-arms it). */
  dismiss: () => void;
}

/**
 * Mobile sticky mini-player (PiP-style) trigger.
 *
 * The media element itself is never re-parented — the caller only toggles CSS
 * classes on a wrapper — so playback state is preserved across the switch.
 *
 * **「滚走了」的判据 = 画框真的跑出视口顶部（`bottom ≤ 0`）。** 早先的实现用
 * `IntersectionObserver` 观察「视口上 20%」这条带、把「不在带内」当成滚走了，
 * 那条带其实有两个出口：画框跑到带上方（真滚走），以及画框本来就在带下方 ——
 * 375×812 首屏正是后者（带底 162.4 vs 画框顶 y=166），于是进页面就被判成
 * 「已滚走」，内联播放器连同入画字幕一起不渲染，整条移动端重设计在参考机型上
 * 等于不可见（#30）。
 *
 * 判据改为**测量**（rAF 合并成每帧一次）而不是观察器的状态跳变：一次跳转滚动
 * （比如在文稿列表里点一句直接跳下去）会让「不在带内」从 false 直接保持 false，
 * 观察器根本不回调，迷你窗便永不出现。滚动容器是壳里的 `main#main-scroll`，
 * scroll 不冒泡，所以监听走捕获阶段。
 *
 * Pass ``enabled=false`` to disable (e.g. on desktop, where the slot is already
 * sticky via CSS).
 */
export function useStickyPip<T extends HTMLElement>(
  slotRef: RefObject<T | null>,
  enabled: boolean
): StickyPipResult {
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPinned(false);
      return;
    }
    const el = slotRef.current;
    if (!el) return;

    let raf = 0;

    const measure = () => {
      const out = el.getBoundingClientRect().bottom <= 0;
      setPinned(out);
      // 画框重新露出来就重新武装关闭（原行为：回到视口内则恢复）。
      if (!out) setDismissed(false);
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };

    measure();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, slotRef]);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { isPip: pinned && !dismissed, dismiss };
}
