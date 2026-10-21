"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { SCROLL_CONTAINER_ID } from "@/lib/scrollMemory";
import { desktopFollowScroll, mobileFollowScroll } from "@/lib/subtitleFollow";

export interface SubtitleFollowArgs {
  /** 当前句下标；它一变就重新对齐（播放 tick、上下句、点文稿行都会推它）。 */
  currentSubtitleIndex: number;
  isMobile: boolean;
  /** 移动端：画框是否已贴顶常驻（`useStickyPip`）。没贴顶时画框与字幕带都在视野里。 */
  isStuck: boolean;
  /** 移动端画框所在的那一列（量它的下沿当落点）。 */
  slotRef: RefObject<HTMLDivElement | null>;
}

export interface SubtitleFollowResult {
  /** 挂到桌面端右侧字幕列表的滚动容器上。 */
  subtitleListRef: RefObject<HTMLDivElement | null>;
  /** 把跟随拉回来（显式句导航时调用：上一句/下一句/点文稿行/深链落点）。 */
  resumeFollow: () => void;
  /**
   * 用户可见的「跟随」开关（设计 `.w-follow` 有这一项，产品此前只有自动跟随）。
   * 默认 true；关掉后句子变化不再滚文稿，打开时立刻对齐当前句。
   * 与「手动滚动暂停」共用 `followPausedRef`：打开开关等于一次显式恢复跟随。
   */
  followEnabled: boolean;
  setFollowEnabled: (enabled: boolean) => void;
}

/**
 * 字幕跟随（DEC-073）分成两条路：
 *   · 桌面：只滚右侧内层字幕列表、把当前句居中，**绝不触碰整页 `<main>`**
 *     （用 scrollIntoView 会连带 `<main>` 一起拽回顶部，停在底部练习区时页面被拽走白屏）。
 *   · 移动端：文稿已是页级滚动（卡内不再有 max-h / 内部滚动条），跟随就把壳滚动容器
 *     `main#main-scroll` 滚到「当前句条目顶边 = 画框下沿 + 8px」，且**只在画框已贴顶常驻
 *     时**才跟 —— 页面还在顶部时画框与字幕带都在视野里，没有任何理由把页面拽走。
 *
 * 用户手动滚一下（touch/wheel）即暂停跟随，等下一次句子导航才恢复；否则播放中的每一句
 * 都会把用户刚滚到的位置抢回去。程序自己的 `scrollBy` 不会触发这两个事件，所以不需要
 * 「是不是我在滚」的判据。
 *
 * 另有一个**用户可见的跟随开关**（设计 `.w-follow`）：`followEnabled=false` 时句子变化
 * 完全不滚文稿；重新打开会清掉手动暂停并立刻对齐当前句。默认 true，行为与旧版一致。
 *
 * 「追到哪、什么时候追」的算术在 `lib/subtitleFollow` 里（可单测）；这里只留 DOM 与生命周期。
 */
export function useSubtitleFollow({
  currentSubtitleIndex,
  isMobile,
  isStuck,
  slotRef,
}: SubtitleFollowArgs): SubtitleFollowResult {
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const followPausedRef = useRef(false);
  // 设计稿的「跟随」开关：用户显式关掉后，句子变化不再滚动文稿；手动滚动的暂停
  // 仍走 followPausedRef（两者互不覆盖：开关是意图，暂停是这一次滚动的效果）。
  const [followEnabled, setFollowEnabledState] = useState(true);

  const resumeFollow = useCallback(() => {
    followPausedRef.current = false;
  }, []);

  const setFollowEnabled = useCallback((enabled: boolean) => {
    setFollowEnabledState(enabled);
    // 重新打开 = 用户要求跟着走：清掉「手动滚动暂停」，让下面的 effect 立刻对齐当前句。
    if (enabled) followPausedRef.current = false;
  }, []);

  // 手动滚动 = 暂停跟随。只监听用户输入事件，程序自己的 scrollBy 不会触发这两个。
  useEffect(() => {
    if (!isMobile) return;
    const scroller = document.getElementById(SCROLL_CONTAINER_ID);
    if (!scroller) return;
    const pauseFollow = () => {
      followPausedRef.current = true;
    };
    scroller.addEventListener("touchstart", pauseFollow, { passive: true });
    scroller.addEventListener("wheel", pauseFollow, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", pauseFollow);
      scroller.removeEventListener("wheel", pauseFollow);
    };
  }, [isMobile]);

  useEffect(() => {
    const el = document.getElementById(`subtitle-${currentSubtitleIndex}`);
    if (!el) return;
    if (!followEnabled) return;
    if (isMobile) {
      const scroller = document.getElementById(SCROLL_CONTAINER_ID);
      const frame = slotRef.current;
      if (!scroller || !frame || !isStuck || followPausedRef.current) return;
      const delta = mobileFollowScroll(
        el.getBoundingClientRect().top,
        // Focusing an in-page control can briefly unstick the frame before
        // this scroll completes. Aim at its final sticky position, otherwise
        // the selected row is left below the player by that temporary offset.
        scroller.getBoundingClientRect().top + frame.getBoundingClientRect().height
      );
      if (delta !== null) scroller.scrollBy({ top: delta, behavior: "smooth" });
      return;
    }
    const container = subtitleListRef.current;
    if (!container) return;
    const offset = desktopFollowScroll(
      { top: el.getBoundingClientRect().top, height: el.clientHeight },
      { top: container.getBoundingClientRect().top, height: container.clientHeight }
    );
    if (offset !== null) container.scrollBy({ top: offset, behavior: "smooth" });
  }, [currentSubtitleIndex, followEnabled, isMobile, isStuck, slotRef]);

  return { subtitleListRef, resumeFollow, followEnabled, setFollowEnabled };
}
