"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
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
 * Practice mode — thin wrapper over useSession with a server-side async grader.
 *
 * Fetches the AI-generated question set for the current exam level and grades
 * each answer **immediately and per-question** via the backend `/practice/grade`
 * endpoint (one question per call). Once a question is graded it is locked;
 * `reset()` clears the attempt.
 */
export function usePracticeMode({
  videoId,
  level,
}: UsePracticeModeOptions): UsePracticeModeReturn {
  const fetcher = useCallback(async () => {
    if (!level) return [];
    const data = await api<PracticeSet>(
      `/api/v1/videos/${videoId}/practice?level=${encodeURIComponent(level)}`,
    );
    return data.questions || [];
  }, [videoId, level]);

  const grader = useCallback(
    async (
      item: PracticeQuestion,
      userAnswer: string,
    ): Promise<GradedResult> => {
      try {
        const res = await api<{ correct: boolean; explanation: string }>(
          `/api/v1/videos/${videoId}/practice/grade`,
          {
            method: "POST",
            body: JSON.stringify({ question: item, user_answer: userAnswer }),
          },
        );
        return { correct: res.correct, explanation: res.explanation };
      } catch {
        return { correct: false, explanation: "判分失败，请稍后重试" };
      }
    },
    [videoId],
  );

  const onError = useCallback((e: unknown): string | null => {
    const msg = e instanceof Error ? e.message : "练习题加载失败";
    // 403 -> pro required; surface a friendly message
    if (msg.includes("Pro")) {
      return "练习模式需要 Pro 订阅。";
    }
    return "练习题加载失败，请稍后重试";
  }, []);

  const session = useSession<PracticeQuestion>({ fetcher, grader, onError });

  return {
    loading: session.loading,
    error: session.error,
    items: session.items,
    answers: session.answers,
    graded: session.graded,
    grading: session.grading,
    answeredCount: session.answeredCount,
    correctCount: session.correctCount,
    score: session.score,
    accuracy: session.accuracy,
    setAnswer: session.setAnswer,
    gradeAnswer: session.gradeAnswer,
    reset: session.reset,
    refetch: session.refetch,
  };
}
