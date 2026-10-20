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

/**
 * CEFR 档位值域（与 `Video.difficulty_level` 的写入值一致）。
 * 筛选下拉、URL `?level=` 的校验都从这里取，避免两处各写一份 A1–C2。
 */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** 是否为合法 CEFR 档位（筛选参数校验用）。 */
export function isCefrLevel(value: string | null | undefined): value is CefrLevel {
  return (
    value !== null && value !== undefined && (CEFR_LEVELS as readonly string[]).includes(value)
  );
}

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
