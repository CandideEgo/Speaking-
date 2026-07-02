"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
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
 * Vocabulary drill — thin wrapper over useSession with a client-side grader.
 *
 * Fetches the deterministic spelling + meaning-choice items for the current
 * exam level (free-tier, no AI) and grades **immediately and per-question**,
 * client-side. Once graded, a question is locked; `reset()` clears the attempt.
 */
export function useVocabDrill({
  videoId,
  level,
}: UseVocabDrillOptions): UseVocabDrillReturn {
  const fetcher = useCallback(async () => {
    if (!level) return [];
    const data = await api<VocabDrillSet>(
      `/api/v1/videos/${videoId}/vocabulary-drill?level=${encodeURIComponent(level)}`,
    );
    return data.items || [];
  }, [videoId, level]);

  const grader = useCallback(
    (item: VocabDrillItem, userAnswer: string): GradedResult => {
      let correct = false;
      if (item.kind === "spelling") {
        correct = normalizeWord(userAnswer) === normalizeWord(item.answer);
      } else {
        // meaning_choice: answer is the correct option string.
        correct = (userAnswer || "").trim() === (item.answer || "").trim();
      }
      return { correct, explanation: null, correctAnswer: item.answer };
    },
    [],
  );

  // 409 (no target words) or load failure → empty state, not a hard error.
  const onError = useCallback(() => null, []);

  const session = useSession<VocabDrillItem>({ fetcher, grader, onError });

  // useVocabDrill's gradeAnswer is sync (returns void); adapt the async one.
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
    gradeAnswer: (index, answer) => {
      void session.gradeAnswer(index, answer);
    },
    reset: session.reset,
    refetch: session.refetch,
  };
}
