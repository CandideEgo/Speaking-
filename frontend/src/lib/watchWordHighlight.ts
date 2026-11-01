/**
 * 观看页字幕词的着色档位（FE-06 提取点）。
 *
 * 四档从强到弱（DEC-073）：
 *   ① 正在学 / 复习中（`learningWords`）→ 品牌实底 + 实线
 *   ② 未收录、命中目标级别 → 极浅底 + 虚线
 *   ③ 已掌握（`masteredWords`）→ 只留虚线下划线
 *   ④ 其余 → 无样式
 *
 * 这里只做「词 + 词级 + 目标级别 + 两张词表 → 类名」的纯映射；取数、持久化与
 * 渲染都在 `hooks/useWatchVocabulary.ts` 与页面里。抽出来的理由是可单测：
 * 档位顺序（正在学压过已掌握、已掌握压过目标级别底色）此前只藏在 1,700 行
 * 页面组件里，回归只能靠浏览器。
 */

import { cleanToken, shouldDisplay, wordHighlightClass } from "@/lib/examLevels";

/** 正在学/复习中的词：品牌实底 + 实线，最强档。 */
export const LEARNING_WORD_CLASS =
  "bg-brand-100 text-brand-700 underline decoration-brand-400 decoration-2 underline-offset-2 rounded-md px-0.5";

export interface WordHighlightContext {
  /** 目标考试级别（`watchStore.selectedExamLevel`），空表示未选。 */
  selectedExamLevel: string | null;
  /** 正在学 / 复习中的词（已归一化）。 */
  learningWords: ReadonlySet<string>;
  /** 已掌握的词（已归一化）。 */
  masteredWords: ReadonlySet<string>;
}

/**
 * 渲染 token → 档位类名。
 *
 * `wordLevels` 是该句的 `{词: 级别[]}` 映射；token 用 `cleanToken` 归一化，
 * 与后端写 `word_levels` 的口径一致。
 */
export function wordHighlightClassFor(
  word: string,
  wordLevels: Record<string, string[]> | null,
  ctx: WordHighlightContext
): string {
  const token = cleanToken(word);
  if (!token) return "";
  if (ctx.learningWords.has(token)) return LEARNING_WORD_CLASS;
  if (!wordLevels || !ctx.selectedExamLevel) return "";
  const levels = wordLevels[token];
  if (!levels || !shouldDisplay(levels, ctx.selectedExamLevel)) return "";
  // 已掌握的词只留形状（虚线下划线），不再吃底色。
  if (ctx.masteredWords.has(token)) {
    return wordHighlightClass(levels, ctx.selectedExamLevel, { only: true });
  }
  // 目标分级优先取色：词属于所选分级时用该分级颜色，否则回退词自身的最高分级颜色。
  return wordHighlightClass(levels, ctx.selectedExamLevel);
}

/** 当前词卡的词是否就是这个词（词卡选中态）。 */
export function isWordSelected(word: string, selectedWord: string | null): boolean {
  if (!selectedWord) return false;
  return selectedWord === cleanToken(word);
}
