/**
 * Practice paper types + static real-paper placeholders.
 *
 * 试卷题目已全部来自后端（考试/每日检测/视频试卷，见 lib/examData.ts）；
 * 这里只保留题型定义与「真题试卷即将上线」的纯展示静态卡（原型本意）。
 */

export type QuestionType = "choice" | "fill" | "write" | "translate" | "speak";

export interface Question {
  type: QuestionType;
  /** 分值。 */
  pts: number;
  /** 题干。 */
  stem: string;
  /** 上下文/引用（视频字幕原文等）。 */
  ctx?: string;
  /** choice: 选项列表。 */
  choices?: string[];
  /** choice: 正确选项索引。 */
  answer?: number;
  /** 展示用答案（如 "B" 或 "that"）。 */
  ans: string;
  /** 解析。 */
  explain: string;
  /** fill: 正确填空答案。 */
  fill?: string;
  /** write/translate: 是否自评（无客观对错）。 */
  self?: boolean;
}

export interface PaperPart {
  /** 部分名，如 "Part I 写作"。 */
  part: string;
  /** 部分元信息，如 "15% · 30 分钟"。 */
  meta: string;
  /** 部分说明。 */
  desc: string;
  items: Question[];
}

export type Paper = PaperPart[];

/** 真题试卷静态示例（即将上线，纯展示）。 */
export interface RealPaper {
  name: string;
  sub: string;
  logo: string;
  logoBg: string; // tailwind bg class
  sets: number;
  q: number;
}

export const SAMPLE_REAL_PAPERS: RealPaper[] = [
  {
    name: "四级真题",
    sub: "CET-4 · 2020-2024",
    logo: "4",
    logoBg: "bg-blue-500",
    sets: 24,
    q: 560,
  },
  {
    name: "六级真题",
    sub: "CET-6 · 2020-2024",
    logo: "6",
    logoBg: "bg-purple-500",
    sets: 24,
    q: 560,
  },
  {
    name: "雅思真题",
    sub: "IELTS · Cambridge 11-18",
    logo: "IELTS",
    logoBg: "bg-red-500",
    sets: 8,
    q: 320,
  },
  {
    name: "托福真题",
    sub: "TOEFL · TPO 真题集",
    logo: "TPO",
    logoBg: "bg-orange-500",
    sets: 12,
    q: 480,
  },
];
