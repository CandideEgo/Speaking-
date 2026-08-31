/**
 * CEFR 难度 ↔ 考试体系对照。
 *
 * 视频 `difficulty_level` 用 CEFR（A1–C2），用户目标用考试体系
 * （高考/四级/六级…，见 lib/examLevels.ts）。两套语言并存会让用户
 * 做两次心算换算，所有面向用户展示难度的地方统一走这里的 "≈" 映射，
 * 把 CEFR 锚定到用户熟悉的考试档位。
 *
 * 档位依据 CET/高考词汇大纲与 CEFR 官方对照的通行共识：
 * A2≈高考、B1≈四级、B2≈六级、C1≈考研/雅思 6.5+。
 */

const CEFR_EXAM_EQUIVALENT: Record<string, string> = {
  A1: "初中",
  A2: "高考",
  B1: "四级",
  B2: "六级",
  C1: "考研/雅思",
  C2: "雅思7+",
};

/** CEFR 级别对应的最近似考试档位，未知级别返回 null。 */
export function cefrExamHint(level: string | null | undefined): string | null {
  if (!level) return null;
  return CEFR_EXAM_EQUIVALENT[level.toUpperCase()] ?? null;
}

/** "B2" → "B2 · ≈六级"；无映射时原样返回。 */
export function cefrWithExamHint(level: string): string {
  const hint = cefrExamHint(level);
  return hint ? `${level} · ≈${hint}` : level;
}
