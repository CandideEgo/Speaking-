/**
 * 词卡的「来源句」解析（FE-06 提取点）。
 *
 * 点词时来源句有四个候选，优先级从显式到隐式：
 *   ① 调用方给的 `sourceOverride`（字幕行点词、深链 `?word=` 的落点）
 *   ② 正在重听的句子（`replayTarget`）
 *   ③ 当前词卡锚定的句子（`wordContext`）
 *   ④ 播放头所在句（`subtitles[currentIndex]`）
 *
 * 词卡已经打开时再点同一个词是「收起」而不是重新查询——这个判断也在这里，
 * 免得把同一段比较散落在页面与 hook 里。
 */

import type { Subtitle } from "@/types";

export interface WordSourceCandidates {
  /** 字幕行/深链显式给的句子。 */
  sourceOverride?: Subtitle | null;
  /** 正在重听的句子。 */
  replayTarget?: Subtitle | null;
  /** 词卡当前锚定的句子。 */
  wordContext?: Subtitle | null;
  /** 播放头所在句；`currentIndex` 越界时忽略。 */
  subtitles?: readonly Subtitle[] | null;
  currentIndex?: number;
}

/** 解析点词时应该挂到哪个句子上。 */
export function resolveWordSource({
  sourceOverride,
  replayTarget,
  wordContext,
  subtitles,
  currentIndex,
}: WordSourceCandidates): Subtitle | null {
  return (
    sourceOverride ??
    replayTarget ??
    wordContext ??
    (subtitles && currentIndex != null ? (subtitles[currentIndex] ?? null) : null) ??
    null
  );
}

export interface WordSourcePosition {
  index: number;
  line: number;
}

/** 来源句在字幕列表里的位置（`line` 是给用户看的 1 起句号）。 */
export function wordSourcePosition(
  subtitles: readonly Subtitle[] | null | undefined,
  source: Subtitle | null
): WordSourcePosition | null {
  if (!subtitles || !source) return null;
  const index = subtitles.findIndex((s) => s.id === source.id);
  return index >= 0 ? { index, line: index + 1 } : null;
}

/** 词卡来源行的文案：`《标题》第 N 句 · 原句`。 */
export function wordSourceLabel(
  videoTitle: string | null | undefined,
  line: number,
  textEn: string | null | undefined
): string {
  return `《${videoTitle ?? "本视频"}》第 ${line} 句 · ${textEn ?? ""}`;
}

/**
 * 再点同一个词是否应视为「收起词卡」。
 *
 * 归一化规则与 `useWordLookup` 一致（去掉首尾非字母），比较的是词 + 来源句 id：
 * 同一句里的同一个词才算重复点击，换句点同一个词仍要重新查询。
 */
export function isSameWordSelection(
  word: string,
  selectedWord: string | null,
  source: Subtitle | null,
  wordContext: Subtitle | null
): boolean {
  if (!selectedWord) return false;
  const clean = word.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
  return selectedWord === clean && (wordContext?.id ?? null) === (source?.id ?? null);
}
