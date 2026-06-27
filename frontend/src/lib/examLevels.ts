/**
 * Exam level taxonomy for the CET/高考/考研 vocabulary feature.
 * Mirror of backend/app/core/exam_levels.py — keep in sync.
 *
 * Display rule: a word is highlighted when its highest level order >= the
 * user's target level order; the highlight color is taken from that highest
 * level. Class strings are static literals so Tailwind's JIT picks them up.
 */

export interface ExamLevelMeta {
  key: string;
  label: string;
  order: number;
  color: string; // tailwind color token
}

export const EXAM_LEVELS: ExamLevelMeta[] = [
  { key: "zhongkao", label: "中考", order: 1, color: "slate" },
  { key: "gaoKao", label: "高考", order: 2, color: "green" },
  { key: "cet4", label: "四级", order: 3, color: "blue" },
  { key: "cet6", label: "六级", order: 4, color: "purple" },
  { key: "ky", label: "考研", order: 5, color: "orange" },
  { key: "ielts", label: "雅思", order: 6, color: "red" },
  { key: "toefl", label: "托福", order: 6, color: "red" },
  { key: "gre", label: "GRE", order: 7, color: "rose" },
];

const LEVEL_BY_KEY: Record<string, ExamLevelMeta> = Object.fromEntries(
  EXAM_LEVELS.map((l) => [l.key, l]),
);

/** Levels offered as a user "target" in the selector (zhongkao/toefl excluded). */
export const TARGET_LEVEL_OPTIONS: ExamLevelMeta[] = EXAM_LEVELS.filter(
  (l) => l.key !== "zhongkao" && l.key !== "toefl",
);

export function levelMeta(key: string): ExamLevelMeta | undefined {
  return LEVEL_BY_KEY[key];
}

export function levelOrder(key: string): number {
  return LEVEL_BY_KEY[key]?.order ?? 0;
}

export function maxLevel(levels: string[]): string | null {
  if (!levels.length) return null;
  return levels.reduce((best, cur) =>
    levelOrder(cur) > levelOrder(best) ? cur : best,
  );
}

/** Display rule: word's max level order >= target level order. */
export function shouldDisplay(
  wordLevels: string[],
  targetLevel: string | null,
): boolean {
  if (!wordLevels.length || !targetLevel) return false;
  const top = maxLevel(wordLevels);
  return top !== null && levelOrder(top) >= levelOrder(targetLevel);
}

export function displayLevel(wordLevels: string[]): ExamLevelMeta | null {
  const top = maxLevel(wordLevels);
  return top ? (LEVEL_BY_KEY[top] ?? null) : null;
}

// Static class strings (one per color token) so Tailwind JIT detects them.
const WORD_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  orange: "bg-orange-100 text-orange-700",
  red: "bg-red-100 text-red-700",
  rose: "bg-rose-100 text-rose-700",
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

/** Tailwind classes for a highlighted word given its exam levels. */
export function wordHighlightClass(levels: string[]): string {
  const meta = displayLevel(levels);
  return meta ? (WORD_COLOR_CLASSES[meta.color] ?? "") : "";
}

/** Small dot class for the level selector chip / badges. */
export function levelDotClass(color: string): string {
  return DOT_COLOR_CLASSES[color] ?? "bg-muted";
}

/** Clean a rendered token the same way the backend does, for word_levels lookup. */
export function cleanToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z']/g, "");
}
