"use client";

/**
 * 观看页词卡的位置与来源句状态（FE-06 提取点）。
 *
 * 页面原先在一个 1,700 行的组件里同时持有：词卡锚点矩形、来源句下标、
 * 「回看原句」的滚动目标，以及「再点同一个词 = 收起」的判断。这里把它们
 * 收成一个 hook；来源句解析与勾选判定在 `lib/watchWordSource.ts`（纯函数，
 * 有单测），词条的查询与朗读仍由 `useWordLookup` 负责。
 */

import { useCallback, useRef, useState } from "react";

import {
  isSameWordSelection,
  resolveWordSource,
  wordSourceLabel as formatWordSourceLabel,
  wordSourcePosition,
  type WordSourcePosition,
} from "@/lib/watchWordSource";
import type { Subtitle } from "@/types";

/** 词卡定位所需的被点词视口矩形（WordTooltipInline 的锚点）。 */
export interface WordAnchorRect {
  left: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface Options {
  selectedWord: string | null;
  /** 当前词卡锚定的句子（`useWordLookup` 的 context）。 */
  wordContext: Subtitle | null;
  /** 正在重听的句子（打开词卡时优先作为来源）。 */
  replayTarget: Subtitle | null;
  /** 最新字幕列表（扩展到播放头所在句的兜底）。 */
  subtitles: readonly Subtitle[] | null | undefined;
  /** 播放头所在句的下标（读 ref，避免闭包陈旧）。 */
  getCurrentIndex: () => number;
  clearWord: () => void;
  /** 发起查词（`useWordLookup.handleWordClick`）。 */
  lookUpWord: (word: string, source: Subtitle | null) => void;
  /** 打开词卡时暂停播放并让出焦点。 */
  pauseForHelp: () => void;
  /** 关闭词卡后恢复播放（带 `resume` 语义）。 */
  closeHelp: () => void;
  /** 「回看原句」要把字幕跟随拉回来。 */
  resumeFollow: () => void;
  videoTitle: string | null | undefined;
  isMobile: boolean;
  immersive: boolean;
}

interface WatchWordCard {
  wordAnchorRect: WordAnchorRect | null;
  wordSource: WordSourcePosition | null;
  /** 词卡来源行文案；没有来源句时为 null。 */
  wordSourceLabel: string | null;
  /** 收起词卡并把焦点还给触发元素。 */
  closeWordCard: () => void;
  /** 点词；再点同一个词（同句）则收起。 */
  openWordCard: (
    word: string,
    anchor?: HTMLElement | null,
    sourceOverride?: Subtitle | null
  ) => void;
  /** 「回看原句」：滚到来源句并恢复跟随。 */
  revealWordSource: () => void;
}

export function useWatchWordCard({
  selectedWord,
  wordContext,
  replayTarget,
  subtitles,
  getCurrentIndex,
  clearWord,
  lookUpWord,
  pauseForHelp,
  closeHelp,
  resumeFollow,
  videoTitle,
  isMobile,
  immersive,
}: Options): WatchWordCard {
  const [wordAnchorRect, setWordAnchorRect] = useState<WordAnchorRect | null>(null);
  const [wordSource, setWordSource] = useState<WordSourcePosition | null>(null);
  const wordTriggerRef = useRef<HTMLElement | null>(null);

  const closeWordCard = useCallback(() => {
    clearWord();
    setWordAnchorRect(null);
    setWordSource(null);
    closeHelp();
    wordTriggerRef.current?.focus({ preventScroll: true });
  }, [clearWord, closeHelp]);

  const openWordCard = useCallback(
    (word: string, anchor?: HTMLElement | null, sourceOverride?: Subtitle | null) => {
      const source = resolveWordSource({
        sourceOverride,
        replayTarget,
        wordContext,
        subtitles,
        currentIndex: getCurrentIndex(),
      });
      if (isSameWordSelection(word, selectedWord, source, wordContext)) {
        closeWordCard();
        return;
      }
      wordTriggerRef.current = anchor ?? null;
      setWordAnchorRect(anchor ? anchor.getBoundingClientRect() : null);
      setWordSource(wordSourcePosition(subtitles, source));
      pauseForHelp();
      lookUpWord(word, source);
    },
    [
      selectedWord,
      wordContext,
      replayTarget,
      subtitles,
      getCurrentIndex,
      closeWordCard,
      pauseForHelp,
      lookUpWord,
    ]
  );

  /** 设计 `.word-pop-actions .undo`「回看原句」：不新建弹层，把文稿滚到该句
   *  （桌面滚右栏、移动滚回当前句卡），并恢复字幕跟随。 */
  const revealWordSource = useCallback(() => {
    const target = wordSource;
    closeWordCard();
    if (!target) return;
    resumeFollow();
    requestAnimationFrame(() => {
      const row = immersive
        ? document.querySelector('[data-testid="current-sentence-card"]')
        : document.getElementById(`subtitle-${target.index}`);
      if (!row) return;
      if (isMobile) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      const scroller = row.closest(".subtitle-scroll") as HTMLElement | null;
      if (!scroller) return;
      const top =
        row.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        12;
      scroller.scrollTo({ top, behavior: "smooth" });
    });
  }, [wordSource, closeWordCard, resumeFollow, isMobile, immersive]);

  const wordSourceLabel = wordSource
    ? formatWordSourceLabel(videoTitle, wordSource.line, wordContext?.text_en ?? "")
    : null;

  return {
    wordAnchorRect,
    wordSource,
    wordSourceLabel,
    closeWordCard,
    openWordCard,
    revealWordSource,
  };
}
