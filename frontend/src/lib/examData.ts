/**
 * Exam system API client + backend→Paper adapters.
 *
 * The backend exam engine emits word-level drill items (recognition /
 * production / context). The practice UI renders the prototype's paper
 * layout (parts + questions), so `drillToPaper` maps items into that shape:
 *   recognition  → Part I   词汇识别 (choice)
 *   production   → Part II  单词拼写 (fill)
 *   context      → Part III 语境运用 (choice / fill / self-eval repeat)
 *
 * In exam mode answers stay server-side: choice items carry no `answer`
 * until the graded review comes back and gets patched into the paper.
 */

import { api } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Paper, PaperPart, Question } from "@/data/practicePaper";

// ---------------------------------------------------------------------------
// DTO types (mirrors backend/app/api/v1/exam.py)
// ---------------------------------------------------------------------------

export interface ExamQuestionDTO {
  /** ExamAnswer row id — referenced when submitting. */
  id: string;
  word: string;
  category: "recognition" | "production" | "context";
  type: string;
  translation: string;
  options?: string[] | null;
  /** Present only in instant mode (client-graded). */
  answer?: string;
  sentence_template?: string | null;
  full_sentence?: string | null;
  phonetic?: string | null;
  video_id?: string | null;
  video_title?: string | null;
}

export interface ExamStartResponse {
  session_id: string;
  mode: "daily_check" | "video_exam" | "wrong_redo";
  exam_level: string;
  video_id: string | null;
  time_limit_seconds: number;
  questions: ExamQuestionDTO[];
}

export interface ExamReviewItem {
  id: string;
  word: string;
  correct: boolean;
  user_answer: string | null;
  answer: string | null;
  translation: string;
}

export interface ExamSubmitResponse {
  session_id: string;
  score: number;
  correct: number;
  total: number;
  part_scores: Record<string, { total: number; correct: number }>;
  answers: ExamReviewItem[];
}

export interface HubPaperCard {
  video_id: string;
  title: string;
  thumbnail_url: string | null;
  question_count: number;
  progress: number;
  last_score: number | null;
}

export interface PracticeHubData {
  month_count: number;
  week_count: number;
  avg_accuracy: number | null;
  last_check: { score: number; date: string } | null;
  wrong_count: number;
  papers: HubPaperCard[];
}

export interface WrongBookItem {
  word: string;
  category: string;
  type: string;
  stem: string;
  from: string;
  answered_at: string;
}

export interface WrongBookResponse {
  count: number;
  items: WrongBookItem[];
}

export interface VideoPaperResponse {
  video_id: string;
  exam_level: string;
  /** Instant mode is client-graded: items include answers. */
  items: ExamQuestionDTO[];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export function startExam(
  mode: "daily_check" | "video_exam" | "wrong_redo",
  opts: { level?: string; videoId?: string } = {}
): Promise<ExamStartResponse> {
  return api<ExamStartResponse>("/api/v1/exam/start", {
    method: "POST",
    body: JSON.stringify({ mode, level: opts.level ?? null, video_id: opts.videoId ?? null }),
  });
}

export function submitExam(
  sessionId: string,
  answers: { id: string; user_answer: string | null }[]
): Promise<ExamSubmitResponse> {
  return api<ExamSubmitResponse>(`/api/v1/exam/${sessionId}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export function getPracticeHub(): Promise<PracticeHubData> {
  return api<PracticeHubData>("/api/v1/practice/hub");
}

export function getWrongBook(): Promise<WrongBookResponse> {
  return api<WrongBookResponse>("/api/v1/practice/wrong");
}

export function startWrongRedo(): Promise<ExamStartResponse> {
  return api<ExamStartResponse>("/api/v1/practice/wrong/redo", { method: "POST" });
}

export function getVideoPaper(videoId: string, level: string): Promise<VideoPaperResponse> {
  return api<VideoPaperResponse>(
    `/api/v1/videos/${videoId}/paper?level=${encodeURIComponent(level)}`
  );
}

// ---------------------------------------------------------------------------
// Adapter: backend drill items -> prototype Paper format
// ---------------------------------------------------------------------------

export const LETTERS = ["A", "B", "C", "D", "E", "F"];

const PARTS: Record<string, { part: string; desc: string }> = {
  recognition: { part: "Part I 词汇识别", desc: "选择正确的词义" },
  production: { part: "Part II 单词拼写", desc: "根据释义拼写单词" },
  context: { part: "Part III 语境运用", desc: "在语境中运用词汇" },
};

function sourceTag(item: ExamQuestionDTO): string {
  return item.video_title ? ` · 出自《${item.video_title}》` : "";
}

function itemToQuestion(item: ExamQuestionDTO, withAnswers: boolean): Question {
  const phonetic = item.phonetic ? ` /${item.phonetic}/` : "";
  const hasOptions = !!item.options && item.options.length > 0;

  if (item.type === "sentence_repeat") {
    // Self-evaluated repeat — instant mode only.
    return {
      type: "write",
      pts: 1,
      stem: "跟读下面的句子（自评）",
      ctx: item.full_sentence ?? "",
      ans: item.full_sentence ?? "",
      explain: `参考句：${item.full_sentence ?? ""}${sourceTag(item)}`,
      self: true,
    };
  }

  if (hasOptions) {
    const choices = item.options as string[];
    const answerIdx = withAnswers && item.answer != null ? choices.indexOf(item.answer) : undefined;
    const stem =
      item.category === "recognition"
        ? `选出「${item.word}${phonetic}」的正确释义`
        : "选词填空：选择最佳词填入空白";
    return {
      type: "choice",
      pts: 1,
      stem,
      ctx: item.category === "context" ? (item.sentence_template ?? undefined) : undefined,
      choices,
      answer: answerIdx !== undefined && answerIdx >= 0 ? answerIdx : undefined,
      ans:
        withAnswers && answerIdx !== undefined && answerIdx >= 0
          ? (LETTERS[answerIdx] ?? item.answer ?? "")
          : "",
      explain: `${item.word} = ${item.translation}${sourceTag(item)}`,
    };
  }

  // Fill / spell
  const isContextFill = item.category === "context";
  return {
    type: "fill",
    pts: 1,
    stem: isContextFill ? "语境填空：填入正确的单词" : `根据释义拼写单词${phonetic}`,
    ctx: isContextFill ? (item.sentence_template ?? undefined) : item.translation || undefined,
    fill: withAnswers ? item.word : undefined,
    ans: withAnswers ? item.word : "",
    explain: `${item.word} = ${item.translation}${sourceTag(item)}`,
  };
}

/**
 * Group drill items into a Paper, preserving order within category buckets.
 *
 * Returns the paper plus `ordered` — the DTOs in exactly the order PaperRunner
 * flattens them, so callers can map qids back to exam answer ids by index.
 */
export function drillToPaper(
  items: ExamQuestionDTO[],
  withAnswers: boolean
): { paper: Paper; ordered: ExamQuestionDTO[] } {
  const buckets: Record<string, { q: Question; dto: ExamQuestionDTO }[]> = {
    recognition: [],
    production: [],
    context: [],
  };
  for (const item of items) {
    const q = itemToQuestion(item, withAnswers);
    (buckets[item.category] ?? buckets.context).push({ q, dto: item });
  }
  const paper: PaperPart[] = [];
  const ordered: ExamQuestionDTO[] = [];
  for (const key of ["recognition", "production", "context"] as const) {
    const entries = buckets[key];
    if (!entries.length) continue;
    paper.push({
      part: PARTS[key].part,
      meta: `${PARTS[key].desc} · ${entries.length} 题`,
      desc: PARTS[key].desc,
      items: entries.map((e) => e.q),
    });
    ordered.push(...entries.map((e) => e.dto));
  }
  return { paper, ordered };
}

/** Category display label for wrong-book rows. */
export function categoryLabel(category: string): string {
  if (category === "recognition") return "词汇识别";
  if (category === "production") return "单词拼写";
  return "语境运用";
}

// ---------------------------------------------------------------------------
// Instant-mode mastery write-back
// ---------------------------------------------------------------------------

/**
 * Batch-submit instant-mode judgements to POST /videos/practice/submit so
 * SM-2 mastery updates. Judgements are debounced (~1s after the last answer)
 * and each question is reported only once per paper.
 *
 * `mapping` must line up with PaperRunner's flatten order: index i in
 * `ordered` corresponds to flatten(paper)[i].qid.
 */
export function useInstantPracticeSubmit(
  videoId: string,
  ordered: ExamQuestionDTO[],
  paperKey: string
) {
  const pendingRef = useRef<Map<string, boolean>>(new Map());
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const [flushTick, setFlushTick] = useState(0);

  // New paper -> drop stale pending results.
  useEffect(() => {
    pendingRef.current = new Map();
  }, [paperKey]);

  const onInstantJudged = useCallback((qid: string, correct: boolean) => {
    pendingRef.current.set(qid, correct);
    setFlushTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (flushTick === 0) return;
    const timer = setTimeout(async () => {
      const pending = pendingRef.current;
      if (pending.size === 0) return;
      const results: { word: string; correct: boolean }[] = [];
      pending.forEach((correct, qid) => {
        // qid format: `${partIndex}-${flatIndex}` — flatIndex is the
        // position in the flattened paper, matching `ordered`.
        const flatIndex = Number(qid.split("-")[1]);
        const dto = orderedRef.current[flatIndex];
        if (dto?.word) results.push({ word: dto.word, correct });
      });
      pending.clear();
      if (!results.length) return;
      try {
        await api("/api/v1/videos/practice/submit", {
          method: "POST",
          body: JSON.stringify({ results, video_id: videoId }),
        });
      } catch {
        // non-fatal: instant practice still works locally
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [flushTick, videoId]);

  return onInstantJudged;
}
