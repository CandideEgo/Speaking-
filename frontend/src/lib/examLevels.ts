/**
 * Exam level taxonomy for the CET/高考/考研 vocabulary feature.
 *
 * The taxonomy itself (which levels exist, their labels, their difficulty
 * order, which are selectable targets) is **generated** from
 * `backend/app/core/exam_levels.py` — see `./examLevels.generated.ts`. Edit the
 * Python module, not the generated file; CI regenerates and fails on a diff.
 *
 * This file holds only what is genuinely frontend's: the Tailwind color token
 * per level, the highlight class maps, and the display rules over `order`.
 *
 * Display rule: a word is highlighted when its highest level order >= the
 * user's target level order. Color rule: the user's target level takes
 * priority when the word belongs to it (e.g. target 四级 + word in
 * [四级, 雅思] renders 四级 blue); otherwise the color falls back to the
 * word's highest level. Class strings are static literals so Tailwind's
 * JIT picks them up.
 */

import {
  EXAM_LEVEL_TAXONOMY,
  TARGET_LEVEL_KEYS,
  type GeneratedExamLevel,
} from "@/lib/examLevels.generated";

export interface ExamLevelMeta extends GeneratedExamLevel {
  color: string; // tailwind color token
}

/**
 * Tailwind color token per level key.
 *
 * Not generated: a color token is a rendering concern, and every consumer of it
 * (the highlight class maps below) is here. Adding a level in Python therefore
 * requires choosing a color here — the deliberately loud throw in the lookup
 * below makes that a build failure rather than silently uncolored words.
 */
const LEVEL_COLORS: Record<string, string> = {
  zhongkao: "slate",
  gaoKao: "green",
  cet4: "blue",
  cet6: "purple",
  ky: "orange",
  ielts: "red",
  toefl: "red",
  gre: "rose",
};

const LEVEL_BY_KEY: Record<string, ExamLevelMeta> = Object.fromEntries(
  EXAM_LEVEL_TAXONOMY.map((level): [string, ExamLevelMeta] => {
    const color = LEVEL_COLORS[level.key];
    if (!color) {
      throw new Error(
        `examLevels: no Tailwind color declared for level "${level.key}" — ` +
          `add one to LEVEL_COLORS after changing backend/app/core/exam_levels.py`
      );
    }
    return [level.key, { ...level, color }];
  })
);

export const EXAM_LEVELS: ExamLevelMeta[] = EXAM_LEVEL_TAXONOMY.map((l) => LEVEL_BY_KEY[l.key]);

/** Levels offered as a user "target" in the selector, per the backend. */
export const TARGET_LEVEL_OPTIONS: ExamLevelMeta[] = TARGET_LEVEL_KEYS.map((k) => LEVEL_BY_KEY[k]);

export function levelMeta(key: string): ExamLevelMeta | undefined {
  return LEVEL_BY_KEY[key];
}

export function levelOrder(key: string): number {
  return LEVEL_BY_KEY[key]?.order ?? 0;
}

export function maxLevel(levels: string[]): string | null {
  if (!levels.length) return null;
  return levels.reduce((best, cur) => (levelOrder(cur) > levelOrder(best) ? cur : best));
}

/** Display rule: word's max level order >= target level order. */
export function shouldDisplay(wordLevels: string[], targetLevel: string | null): boolean {
  if (!wordLevels.length || !targetLevel) return false;
  const top = maxLevel(wordLevels);
  return top !== null && levelOrder(top) >= levelOrder(targetLevel);
}

/**
 * The level whose color should highlight the word.
 *
 * Target-priority rule: when `targetLevel` is provided and the word belongs
 * to it, that level's color wins (selected 四级 + word in [四级, 雅思] → 四级
 * blue, not 雅思 red). Otherwise falls back to the word's highest level.
 * Callers without a target context (editors, tooltips) get the fallback.
 */
export function displayLevel(
  wordLevels: string[],
  targetLevel?: string | null
): ExamLevelMeta | null {
  if (targetLevel && wordLevels.includes(targetLevel)) {
    return LEVEL_BY_KEY[targetLevel] ?? null;
  }
  const top = maxLevel(wordLevels);
  return top ? (LEVEL_BY_KEY[top] ?? null) : null;
}

// Static class strings (one per color token) so Tailwind JIT detects them.
// D12: each highlight carries a dotted underline so exam-level words stay
// distinguishable without relying on color alone (a11y).
const WORD_COLOR_CLASSES: Record<string, string> = {
  slate:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 underline decoration-slate-400 decoration-dotted underline-offset-2",
  green:
    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 underline decoration-green-400 decoration-dotted underline-offset-2",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 underline decoration-blue-400 decoration-dotted underline-offset-2",
  purple:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 underline decoration-purple-400 decoration-dotted underline-offset-2",
  orange:
    "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 underline decoration-orange-400 decoration-dotted underline-offset-2",
  red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 underline decoration-red-400 decoration-dotted underline-offset-2",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300 underline decoration-rose-400 decoration-dotted underline-offset-2",
};

// DEC-073：未掌握词只给一档极浅底色（bg-*-50），已掌握词连底色都不要、只留虚线下划线。
// 两套都写成静态字面类，理由同上（Tailwind JIT 只扫字面量）。
const WORD_SOFT_COLOR_CLASSES: Record<string, string> = {
  slate:
    "bg-slate-50 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300 underline decoration-slate-400 decoration-dotted underline-offset-2",
  green:
    "bg-green-50 text-green-700 dark:bg-green-900/60 dark:text-green-300 underline decoration-green-400 decoration-dotted underline-offset-2",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 underline decoration-blue-400 decoration-dotted underline-offset-2",
  purple:
    "bg-purple-50 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 underline decoration-purple-400 decoration-dotted underline-offset-2",
  orange:
    "bg-orange-50 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300 underline decoration-orange-400 decoration-dotted underline-offset-2",
  red: "bg-red-50 text-red-700 dark:bg-red-900/60 dark:text-red-300 underline decoration-red-400 decoration-dotted underline-offset-2",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 underline decoration-rose-400 decoration-dotted underline-offset-2",
};

const WORD_UNDERLINE_ONLY_CLASSES: Record<string, string> = {
  slate: "underline decoration-slate-400 decoration-dotted underline-offset-2",
  green: "underline decoration-green-400 decoration-dotted underline-offset-2",
  blue: "underline decoration-blue-400 decoration-dotted underline-offset-2",
  purple: "underline decoration-purple-400 decoration-dotted underline-offset-2",
  orange: "underline decoration-orange-400 decoration-dotted underline-offset-2",
  red: "underline decoration-red-400 decoration-dotted underline-offset-2",
  rose: "underline decoration-rose-400 decoration-dotted underline-offset-2",
};

const DOT_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  rose: "bg-rose-500",
};

/**
 * Tailwind classes for a highlighted word given its exam levels.
 *
 * DEC-073 的四档里，本函数负责"命中目标级别"这一侧的两档：
 *   · 默认（未掌握的未收录词）= 浅底 + 虚线（soft）
 *   · `only: true`（已掌握/已收录的词）= 只留虚线下划线，不上任何底色
 * 正在学/复习中那一档（品牌实底）由页面自己的 `levelClassFor` 先判，不走这里。
 */
export function wordHighlightClass(
  levels: string[],
  targetLevel?: string | null,
  opts?: { soft?: boolean; only?: boolean }
): string {
  const meta = displayLevel(levels, targetLevel);
  if (!meta) return "";
  if (opts?.only) return WORD_UNDERLINE_ONLY_CLASSES[meta.color] ?? "";
  if (opts?.soft === false) return WORD_COLOR_CLASSES[meta.color] ?? "";
  return WORD_SOFT_COLOR_CLASSES[meta.color] ?? "";
}

/** Small dot class for the level selector chip / badges. */
export function levelDotClass(color: string): string {
  return DOT_COLOR_CLASSES[color] ?? "bg-muted";
}

/** Clean a rendered token the same way the backend does, for word_levels lookup. */
export function cleanToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z']/g, "");
}
