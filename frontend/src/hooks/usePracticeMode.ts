"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PracticeQuestion, PracticeSet, GradedResult } from "@/types";

interface UsePracticeModeOptions {
  videoId: string;
  /** Target exam level key (e.g. "cet4"). Practice set is fetched per level. */
  level: string | null;
}

export interface UsePracticeModeReturn {
  loading: boolean;
  error: string | null;
  items: PracticeQuestion[];
  answers: Record<number, string>;
  graded: Record<number, GradedResult>;
  grading: Record<number, boolean>;
  answeredCount: number;
  correctCount: number;
  /** Score over total questions (0-100). null until items load. */
  score: number | null;
  /** Running accuracy over answered questions (0-100). null if none answered. */
  accuracy: number | null;
  setAnswer: (index: number, answer: string) => void;
  /** Grade a single question. Pass `answer` to set+grade in one go (choice
   * questions); omit to grade the currently-entered answer (text questions). */
  gradeAnswer: (index: number, answer?: string) => Promise<void>;
  reset: () => void;
  refetch: () => Promise<void>;
}

/**
 * Practice mode: fetches the AI-generated question set for the current exam
 * level and grades each answer **immediately and per-question** via the
 * backend `/practice/grade` endpoint (one question per call). Once a question
 * is graded it is locked; `reset()` clears the attempt.
 */
export function usePracticeMode({
  videoId,
  level,
}: UsePracticeModeOptions): UsePracticeModeReturn {
  const [items, setItems] = useState<PracticeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState<Record<number, GradedResult>>({});
  const [grading, setGrading] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPractice = useCallback(async () => {
    if (!level) return;
    setLoading(true);
    setError(null);
    setGraded({});
    setGrading({});
    setAnswers({});
    try {
      const data = await api<PracticeSet>(
        `/api/v1/videos/${videoId}/practice?level=${encodeURIComponent(level)}`,
      );
      setItems(data.questions || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "练习题加载失败";
      // 403 -> pro required; surface a friendly message
      if (msg.includes("Pro")) {
        setError("练习模式需要 Pro 订阅。");
      } else {
        setError("练习题加载失败，请稍后重试");
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [videoId, level]);

  useEffect(() => {
    fetchPractice();
  }, [fetchPractice]);

  const setAnswer = useCallback((index: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [index]: answer }));
  }, []);

  const gradeAnswer = useCallback(
    async (index: number, answer?: string) => {
      // Lock-after-grade + in-flight guard: don't re-grade a question that is
      // already graded or currently being graded (prevents double POST on
      // rapid double-click of options before the response lands).
      if (graded[index] || grading[index]) return;
      const q = items[index];
      if (!q) return;
      const ua = answer !== undefined ? answer : answers[index] || "";
      if (answer !== undefined) {
        setAnswers((prev) => ({ ...prev, [index]: answer }));
      }
      setGrading((prev) => ({ ...prev, [index]: true }));
      try {
        const res = await api<{ correct: boolean; explanation: string }>(
          `/api/v1/videos/${videoId}/practice/grade`,
          {
            method: "POST",
            body: JSON.stringify({ question: q, user_answer: ua }),
          },
        );
        setGraded((prev) => ({
          ...prev,
          [index]: { correct: res.correct, explanation: res.explanation },
        }));
      } catch {
        setGraded((prev) => ({
          ...prev,
          [index]: { correct: false, explanation: "判分失败，请稍后重试" },
        }));
      } finally {
        setGrading((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
      }
    },
    [items, answers, graded, grading, videoId],
  );

  const reset = useCallback(() => {
    setGraded({});
    setGrading({});
    setAnswers({});
  }, []);

  const answeredCount = Object.keys(graded).length;
  const correctCount = Object.values(graded).filter((g) => g.correct).length;
  const score = items.length
    ? Math.round((correctCount / items.length) * 100)
    : null;
  const accuracy = answeredCount
    ? Math.round((correctCount / answeredCount) * 100)
    : null;

  return {
    loading,
    error,
    items,
    answers,
    graded,
    grading,
    answeredCount,
    correctCount,
    score,
    accuracy,
    setAnswer,
    gradeAnswer,
    reset,
    refetch: fetchPractice,
  };
}
