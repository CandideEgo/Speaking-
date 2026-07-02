"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import type { QuizQuestion, GradedResult } from "@/types";

interface UseQuizOptions {
  videoId: string;
}

export interface UseQuizReturn {
  loading: boolean;
  error: string | null;
  items: QuizQuestion[];
  answers: Record<number, string>;
  graded: Record<number, GradedResult>;
  grading: Record<number, boolean>;
  answeredCount: number;
  correctCount: number;
  /** All questions graded — gates the "完成测验" score-recording button. */
  allGraded: boolean;
  score: number | null;
  accuracy: number | null;
  setAnswer: (index: number, answer: string) => void;
  gradeAnswer: (index: number, answer?: string) => void;
  /** POST the running score to /quiz/submit (score-recording side effect,
   * not a gate to seeing answers). Only meaningful once allGraded. */
  recordScore: () => Promise<void>;
  reset: () => void;
  refetch: () => Promise<void>;
}

/**
 * Quiz/assessment state on the watch page — thin wrapper over useSession with
 * a client-side grader.
 *
 * Grades **immediately and per-question**, client-side. `recordScore()`
 * preserves the legacy `/quiz/submit` score-recording call once all questions
 * are answered.
 */
export function useQuiz({ videoId }: UseQuizOptions): UseQuizReturn {
  const fetcher = useCallback(async () => {
    const data = await api<{ quiz: QuizQuestion[] }>(
      `/api/v1/videos/${videoId}/quiz`,
    );
    return data.quiz || [];
  }, [videoId]);

  const grader = useCallback(
    (item: QuizQuestion, userAnswer: string): GradedResult => {
      const correct =
        userAnswer.trim().toLowerCase() === item.answer.trim().toLowerCase();
      return { correct, explanation: null, correctAnswer: item.answer };
    },
    [],
  );

  // quiz not available → empty state, not a hard error
  const onError = useCallback(() => null, []);

  const session = useSession<QuizQuestion>({ fetcher, grader, onError });

  const recordScore = useCallback(async () => {
    const total = session.items.length;
    if (!total) return;
    const correct = Object.values(session.graded).filter(
      (g) => g.correct,
    ).length;
    const sc = Math.round((correct / total) * 100);
    try {
      const form = new FormData();
      form.append("score", String(sc));
      await api(`/api/v1/videos/${videoId}/quiz/submit`, {
        method: "POST",
        body: form,
        headers: {} as Record<string, string>,
      });
    } catch {
      /* ignore submission errors */
    }
  }, [session.graded, session.items, videoId]);

  return {
    loading: session.loading,
    error: session.error,
    items: session.items,
    answers: session.answers,
    graded: session.graded,
    grading: session.grading,
    answeredCount: session.answeredCount,
    correctCount: session.correctCount,
    allGraded: session.allGraded,
    score: session.score,
    accuracy: session.accuracy,
    setAnswer: session.setAnswer,
    gradeAnswer: (index, answer) => {
      void session.gradeAnswer(index, answer);
    },
    recordScore,
    reset: session.reset,
    refetch: session.refetch,
  };
}
