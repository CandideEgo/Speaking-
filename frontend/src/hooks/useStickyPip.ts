"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export interface StickyPipResult {
  /**
   * True once the slot's **top edge has been pushed past the scroll container's
   * top**, and the user has not dismissed the follow. Use it to add
   * `sticky top-0` (+ `z-index`) to the media wrapper on mobile.
   */
  isStuck: boolean;
  /** Retire the follow and bring the picture back into the viewport. */
  dismiss: () => void;
}

/**
 * 移动端播放页：滚过画框之后，画面**贴顶常驻**（wayfinder #30 定的形态）。
 *
 * 元素永不 re-parent —— 调用方只切一个 class（`sticky top-*` ↔ 常规流），
 * `<video>` 节点原地不动，所以切换不丢播放进度。
 *
 * **判据不能用被粘住的那个元素自己量。** 这是本题唯一咬人的地方：
 * 元素一旦 `sticky`，它的 `getBoundingClientRect().top` 就恒等于**钉住的那个位置**
 * （实测 64.0），于是「顶边被推上去了吗」永远问不出答案 —— 测一次、置位、
 * 下一次测量立刻把它判回 false，class 一撤元素弹回原位、又被判 true，
 * 在 sticky/static 之间自激振荡（实测滚到 100 / 300 / 727 时 colPosition 在
 * 两者之间翻，画框顶在 64 与 -36 之间跳）。
 *
 * 所以改用一个**零高度哨兵**：`<div>` 插在滚动容器的第一个子元素之前，
 * 位置就是列的自然落点。哨兵不会粘，它滚出滚动容器顶边 ⇔ 列该开始跟了。
 * 一次插入、一次移除，不动 React 的树（哨兵不是 React 渲染出来的节点）。
 *
 * 早先的判据是「画框真的跑出视口顶部（`bottom ≤ 0`）」——那是对的，
 * 但它对应的是**缩成右下角小窗**那一态（元素脱离文档流、飞到底角）。
 * #30 把形态改成贴顶常驻之后这个元素永远不会滚出视口，判据必须换成「顶边被推上去了」。
 *
 * 判据用**测量**（rAF 合并成每帧一次）而不是 `IntersectionObserver` 的状态跳变：
 * 一次跳转滚动（比如在文稿列表里点一句直接跳下去）会让状态从 false 直接保持
 * false，观察器根本不回调。滚动容器是壳里的 `main#main-scroll`，scroll 不冒泡，
 * 所以监听走捕获阶段。
 *
 * Pass ``enabled=false`` to disable (e.g. on desktop, where the slot is already
 * sticky via CSS).
 */
export function useStickyPip<T extends HTMLElement>(
  slotRef: RefObject<T | null>,
  enabled: boolean
): StickyPipResult {
  const [stuck, setStuck] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setStuck(false);
      return;
    }
    const el = slotRef.current;
    if (!el) return;
    const scroller = el.closest("main");
    if (!scroller) return;

    // 哨兵：零高度、不粘、不参与布局，位置就是这一列的自然落点。
    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "height:0;margin:0;padding:0;border:0;pointer-events:none;";
    scroller.insertBefore(sentinel, scroller.firstChild);

    let raf = 0;

    const measure = () => {
      const out = sentinel.getBoundingClientRect().top < scroller.getBoundingClientRect().top - 0.5;
      setStuck(out);
      // 画框落回原位就重新武装（与旧行为一致：回到起点则恢复跟随）。
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
      sentinel.remove();
    };
  }, [enabled, slotRef]);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { isStuck: stuck && !dismissed, dismiss };
}
