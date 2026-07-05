"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { GradedResult } from "@/types";

// ---------------------------------------------------------------------------
// Core types — shared by all practice modes
// ---------------------------------------------------------------------------

/** A single question/item in any practice session. Each mode provides its own
 *  concrete type (PracticeItem). */
// No structural constraint — concrete item types are passed through as-is.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SessionItem = object;

/** The result of grading one item. */
export interface SessionGradedResult extends GradedResult {}

/** Fetcher: returns the items array for the session. */
export type SessionFetcher<I extends SessionItem> = () => Promise<I[]>;

/** Grader: given an item and the user's answer, returns the graded result.
 *  May be async (server-side grading) or sync (client-side). */
export type SessionGrader<I extends SessionItem> = (
  item: I,
  userAnswer: string,
) => Promise<GradedResult> | GradedResult;

/** The shared session state machine returned by useSession. */
export interface UseSessionReturn<I extends SessionItem> {
  loading: boolean;
  error: string | null;
  items: I[];
  answers: Record<number, string>;
  graded: Record<number, GradedResult>;
  grading: Record<number, boolean>;
  answeredCount: number;
  correctCount: number;
  /** Score over total questions (0-100). null until items load. */
  score: number | null;
  /** Running accuracy over answered questions (0-100). null if none answered. */
  accuracy: number | null;
  /** All questions graded — gates completion actions. */
  allGraded: boolean;
  setAnswer: (index: number, answer: string) => void;
  /** Grade a single question. Pass `answer` to set+grade in one go (choice
   *  questions); omit to grade the currently-entered answer (text questions). */
  gradeAnswer: (index: number, answer?: string) => Promise<void>;
  reset: () => void;
  refetch: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseSessionOptions<I extends SessionItem> {
  /** Fetch the items for this session. Should throw on hard errors; returning
   *  an empty array signals "no content available" (shown as empty state). */
  fetcher: SessionFetcher<I>;
  /** Grade a single item. Async for server-side grading, sync for client-side. */
  grader: SessionGrader<I>;
  /** Optional error handler for the fetcher. Defaults to a no-op (empty state). */
  onError?: (error: unknown) => string | null;
  /** Whether to start loading immediately on mount. Default true. */
  enabled?: boolean;
}

/**
 * Generic practice-session state machine.
 *
 * Replaces the isomorphic duplication across usePracticeMode, useVocabDrill,
 * and useQuiz. Each of those hooks now delegates here with a mode-specific
 * fetcher and grader:
 *
 *   - practice: server-side async grader (POST /practice/grade)
 *   - vocab:    client-side sync grader (spelling normalize / meaning match)
 *   - quiz:     client-side sync grader (case-insensitive match)
 *
 * The shared state machine: fetch items → set answers → grade per-item
 * (lock-after-grade) → compute score/accuracy → reset.
 */
export function useSession<I extends SessionItem>({
  fetcher,
  grader,
  onError,
  enabled = true,
}: UseSessionOptions<I>): UseSessionReturn<I> {
  const [items, setItems] = useState<I[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState<Record<number, GradedResult>>({});
  const [grading, setGrading] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    setGraded({});
    setGrading({});
    setAnswers({});
    try {
      const data = await fetcher();
      setItems(data || []);
    } catch (e) {
      const msg = onError ? onError(e) : null;
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetcher, onError, enabled]);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  const setAnswer = useCallback((index: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [index]: answer }));
  }, []);

  const gradeAnswer = useCallback(
    async (index: number, answer?: string) => {
      // Lock-after-grade + in-flight guard: don't re-grade a question that is
      // already graded or currently being graded (prevents double POST on
      // rapid double-click of options before the response lands).
      if (graded[index] || grading[index]) return;
      const item = items[index];
      if (!item) return;
      const ua = answer !== undefined ? answer : answers[index] || "";
      if (answer !== undefined) {
        setAnswers((prev) => ({ ...prev, [index]: answer }));
      }
      // Track in-flight state (meaningful for async graders; no-op visual
      // for sync graders but keeps the shape uniform).
      setGrading((prev) => ({ ...prev, [index]: true }));
      try {
        const result = await grader(item, ua);
        setGraded((prev) => ({ ...prev, [index]: result }));
      } finally {
        setGrading((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
      }
    },
    [items, answers, graded, grading, grader],
  );

  const reset = useCallback(() => {
    setGraded({});
    setGrading({});
    setAnswers({});
  }, []);

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
    grading,
    answeredCount,
    correctCount,
    score,
    accuracy,
    allGraded,
    setAnswer,
    gradeAnswer,
    reset,
    refetch,
  };
}
