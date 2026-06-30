"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
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
 * Quiz/assessment state on the watch page. Grades **immediately and
 * per-question**, client-side. `recordScore()` preserves the legacy
 * `/quiz/submit` score-recording call once all questions are answered.
 */
export function useQuiz({ videoId }: UseQuizOptions): UseQuizReturn {
  const [items, setItems] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState<Record<number, GradedResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuiz = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGraded({});
    setAnswers({});
    try {
      const data = await api<{ quiz: QuizQuestion[] }>(
        `/api/v1/videos/${videoId}/quiz`,
      );
      setItems(data.quiz || []);
    } catch {
      // quiz not available → empty state, not a hard error
      setItems([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  const setAnswer = useCallback((index: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [index]: answer }));
  }, []);

  const gradeAnswer = useCallback(
    (index: number, answer?: string) => {
      if (graded[index]) return;
      const q = items[index];
      if (!q) return;
      const ua = answer !== undefined ? answer : answers[index] || "";
      if (answer !== undefined) {
        setAnswers((prev) => ({ ...prev, [index]: answer }));
      }
      const correct = ua.trim().toLowerCase() === q.answer.trim().toLowerCase();
      setGraded((prev) => ({
        ...prev,
        [index]: { correct, explanation: null, correctAnswer: q.answer },
      }));
    },
    [items, answers, graded],
  );

  const reset = useCallback(() => {
    setGraded({});
    setAnswers({});
  }, []);

  const recordScore = useCallback(async () => {
    const total = items.length;
    if (!total) return;
    const correct = Object.values(graded).filter((g) => g.correct).length;
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
  }, [graded, items, videoId]);

  const answeredCount = Object.keys(graded).length;
  const correctCount = Object.values(graded).filter((g) => g.correct).length;
  const allGraded = items.length > 0 && answeredCount === items.length;
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
    grading: {},
    answeredCount,
    correctCount,
    allGraded,
    score,
    accuracy,
    setAnswer,
    gradeAnswer,
    recordScore,
    reset,
    refetch: fetchQuiz,
  };
}
