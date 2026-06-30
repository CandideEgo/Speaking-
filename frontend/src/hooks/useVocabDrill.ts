"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { VocabDrillItem, VocabDrillSet, GradedResult } from "@/types";

interface UseVocabDrillOptions {
  videoId: string;
  level: string | null;
}

export interface UseVocabDrillReturn {
  loading: boolean;
  error: string | null;
  items: VocabDrillItem[];
  answers: Record<number, string>;
  graded: Record<number, GradedResult>;
  grading: Record<number, boolean>;
  answeredCount: number;
  correctCount: number;
  score: number | null;
  accuracy: number | null;
  setAnswer: (index: number, answer: string) => void;
  gradeAnswer: (index: number, answer?: string) => void;
  reset: () => void;
  refetch: () => Promise<void>;
}

/** Normalize an English word for lenient spelling comparison:
 * lowercase, trim, drop a simple plural/tense suffix. */
function normalizeWord(s: string): string {
  const w = (s || "").toLowerCase().trim();
  for (const suf of ["ing", "ed", "es", "s"]) {
    if (w.length > suf.length + 1 && w.endsWith(suf))
      return w.slice(0, -suf.length);
  }
  return w;
}

/**
 * Vocabulary drill: fetches the deterministic spelling + meaning-choice items
 * for the current exam level (free-tier, no AI) and grades **immediately and
 * per-question**, client-side. Once graded, a question is locked; `reset()`
 * clears the attempt.
 */
export function useVocabDrill({
  videoId,
  level,
}: UseVocabDrillOptions): UseVocabDrillReturn {
  const [items, setItems] = useState<VocabDrillItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState<Record<number, GradedResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDrill = useCallback(async () => {
    if (!level) return;
    setLoading(true);
    setError(null);
    setGraded({});
    setAnswers({});
    try {
      const data = await api<VocabDrillSet>(
        `/api/v1/videos/${videoId}/vocabulary-drill?level=${encodeURIComponent(level)}`,
      );
      setItems(data.items || []);
    } catch {
      // 409 (no target words) or load failure → empty state, not a hard error toast.
      setItems([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [videoId, level]);

  useEffect(() => {
    fetchDrill();
  }, [fetchDrill]);

  const setAnswer = useCallback((index: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [index]: answer }));
  }, []);

  const gradeAnswer = useCallback(
    (index: number, answer?: string) => {
      if (graded[index]) return;
      const it = items[index];
      if (!it) return;
      const ua = answer !== undefined ? answer : answers[index] || "";
      if (answer !== undefined) {
        setAnswers((prev) => ({ ...prev, [index]: answer }));
      }
      let correct = false;
      if (it.kind === "spelling") {
        correct = normalizeWord(ua) === normalizeWord(it.answer);
      } else {
        // meaning_choice: answer is the correct option string.
        correct = (ua || "").trim() === (it.answer || "").trim();
      }
      setGraded((prev) => ({
        ...prev,
        [index]: { correct, explanation: null, correctAnswer: it.answer },
      }));
    },
    [items, answers, graded],
  );

  const reset = useCallback(() => {
    setGraded({});
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
    grading: {},
    answeredCount,
    correctCount,
    score,
    accuracy,
    setAnswer,
    gradeAnswer,
    reset,
    refetch: fetchDrill,
  };
}
