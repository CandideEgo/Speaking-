import type { ExamQuestionPublic } from "@/components/exam/ExamRunner";
import { subjectLabel } from "./examSubjects";
export const SECTION_LABELS: Record<string, string> = {
  use_of_english: "Use of English · 完形填空",
  reading_A: "Section A · 选词填空",
  reading_B: "Section B · 段落匹配",
  reading_C: "Section C · 仔细阅读",
  new_type: "Part B · 新题型",
};

const WORD_BANK_MARKER = "[word bank]";

interface DerivedOptions {
  /** bank = 选词填空词库；matching = 段落匹配段落字母。 */
  kind: "bank" | "matching";
  options: Record<string, string>;
}

/**
 * 选词填空 / 段落匹配题的 options 不落库（词库在 passage 末尾的
 * [word bank] 附录里，恒为 A-O；段落匹配的可选答案就是文章里的段落字母，可到 R），
 * 前端从 passage 现场推导，否则这两节完全没有可点元素。
 */
export function deriveOptions(q: ExamQuestionPublic): DerivedOptions | null {
  if (q.options || !q.passage) return null;
  const idx = q.passage.toLowerCase().indexOf(WORD_BANK_MARKER);
  if (idx !== -1) {
    const raw = q.passage.slice(idx + WORD_BANK_MARKER.length);
    const marks = [...raw.matchAll(/([A-O])\)/g)];
    const options: Record<string, string> = {};
    for (let i = 0; i < marks.length; i++) {
      const start = (marks[i].index ?? 0) + marks[i][0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index : raw.length;
      const word = raw
        .slice(start, end)
        .split(/\s+\d+\)/)[0]
        .trim();
      if (word) options[marks[i][1]] = word;
    }
    return Object.keys(options).length ? { kind: "bank", options } : null;
  }
  if (q.question_type === "matching") {
    const letters = [...new Set([...q.passage.matchAll(/^([A-Z])\)/gm)].map((m) => m[1]))];
    if (letters.length < 2) return null;
    return {
      kind: "matching",
      options: Object.fromEntries(letters.map((l) => [l, `段落 ${l}`])),
    };
  }
  return null;
}

/** 选词填空渲染正文时去掉末尾的词库附录（词库以选项形式单独展示）。 */
export function stripWordBank(passage: string): string {
  const idx = passage.toLowerCase().indexOf(WORD_BANK_MARKER);
  return idx === -1 ? passage : passage.slice(0, idx).trim();
}

// 句末标点紧跟大写单词 = 源 PDF 换行时丢掉的空格（"…so far.Whether…"）。
// 要求大写字母后面再跟一个小写字母，既补回真实断句，又避开 U.S.A / A.M.
// 这类全大写缩写与小数。
const MISSING_SPACE_RE = /([.!?])([A-Z][a-z])/g;

/**
 * 补回正文字句之间丢失的空格。
 *
 * 真题 PDF 转文本时按行拼接，行尾标点后的空格被吞掉，正文会出现
 * 「far.Whether」这种连写。这是展示层能修的最小改动；真正的修复在导入
 * 管道，但已经入库的卷子不该因为导入缺陷一路难读到用户面前。
 */
export function normalizePassageSpacing(passage: string): string {
  return passage.replace(MISSING_SPACE_RE, "$1 $2");
}

export interface QuestionGroup {
  key: string;
  section: string;
  passage: string | null;
  questions: ExamQuestionPublic[];
  derived: DerivedOptions | null;
}

/** 同一 section + 同一篇文章的题归为一组，文章只渲染一次。 */
export function buildGroups(questions: ExamQuestionPublic[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  const byKey = new Map<string, QuestionGroup>();
  for (const q of questions) {
    const key = `${q.section}\u0000${q.passage ?? ""}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        section: q.section,
        passage: q.passage,
        questions: [],
        derived: q.passage ? deriveOptions(q) : null,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.questions.push(q);
  }
  return groups;
}

export function paperIdentity(paper: {
  level: string;
  year: number;
  month: number;
  set_no: number;
}): string {
  return `${paper.year} 年${["cet4", "cet6"].includes(paper.level) ? ` ${paper.month} 月` : ""} · ${subjectLabel(paper.level)}第 ${paper.set_no} 套`;
}
export function suggestedMinutesFor(count: number): number {
  return Math.max(4, Math.round((count * 40) / 30));
}

/**
 * 把题号折成区间：`[1,2,3,5,7,8]` → `1–3、5、7–8`。
 *
 * 题组下拉里原来逐个列题号（一整套完形就是 20 个数字），在手机上把
 * `<select>` 撑出屏幕。区间写法既短又保留了「这组包含哪些题」的信息。
 */
export function formatNumberRanges(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = n;
  }
  if (sorted.length) parts.push(start === prev ? `${start}` : `${start}–${prev}`);
  return parts.join("、");
}

export function catalogReturnHref(value: string | null): string {
  return value?.startsWith("/practice/exams?") ? value : "/practice/exams";
}
