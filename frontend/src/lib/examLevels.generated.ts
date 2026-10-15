// GENERATED FILE — DO NOT EDIT.
//
// Source of truth: backend/app/core/exam_levels.py
// Regenerate:     cd backend && python scripts/generate_exam_levels.py
//
// CI regenerates this and fails on any diff (.github/workflows/ci.yml), so a
// hand-edit here will be reverted by the next run. Change the Python module.
//
// Not generated, on purpose: the Tailwind color tokens (a rendering concern,
// declared in examLevels.ts alongside the highlight class maps) and the display
// rules over `order`.

/** One exam level: stable key, display label, difficulty order (lower = easier). */
export interface GeneratedExamLevel {
  key: string;
  label: string;
  order: number;
}

/** All levels, in taxonomy (difficulty) order. */
export const EXAM_LEVEL_TAXONOMY: GeneratedExamLevel[] = [
  { key: "zhongkao", label: "中考", order: 1 },
  { key: "gaoKao", label: "高考", order: 2 },
  { key: "cet4", label: "四级", order: 3 },
  { key: "cet6", label: "六级", order: 4 },
  { key: "ky", label: "考研", order: 5 },
  { key: "ielts", label: "雅思", order: 6 },
  { key: "toefl", label: "托福", order: 6 },
  { key: "gre", label: "GRE", order: 7 },
];

/** Levels offered as a user "target" in the selector. */
export const TARGET_LEVEL_KEYS: string[] = ["gaoKao", "cet4", "cet6", "ky", "ielts", "gre"];
