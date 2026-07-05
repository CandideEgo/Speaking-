"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  GradedResult,
  PracticeItem,
  PracticeSubmitRequest,
  UnifiedPracticeSet,
  VocabularyPracticeSet,
} from "@/types";
import { useSession } from "./useSession";

// ---------------------------------------------------------------------------
// Lenient word matching (reused from old useVocabDrill)
// ---------------------------------------------------------------------------

function normalizeWord(s: string): string {
  let w = s.trim().toLowerCase();
  // Strip common inflectional suffixes for lenient match
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  return w;
}

// ---------------------------------------------------------------------------
// Client-side grader
// ---------------------------------------------------------------------------

function gradePracticeItem(
  item: PracticeItem,
  userAnswer: string,
): GradedResult {
  const ua = userAnswer.trim();
  const expected = item.answer.trim();

  switch (item.type) {
    // Recognition: match selected option against answer
    case "listen_choose_meaning":
    case "see_word_choose_meaning": {
      const correct = ua.toLowerCase() === expected.toLowerCase();
      return { correct, explanation: null, correctAnswer: expected };
    }

    // Production: lenient spelling match
    case "see_meaning_spell_word":
    case "listen_spell_word": {
      const correct = normalizeWord(ua) === normalizeWord(expected);
      return { correct, explanation: null, correctAnswer: expected };
    }

    // Context fill: option match or lenient spelling
    case "context_fill": {
      if (item.options && item.options.length > 0) {
        const correct = ua.toLowerCase() === expected.toLowerCase();
        return { correct, explanation: null, correctAnswer: expected };
      }
      const correct = normalizeWord(ua) === normalizeWord(expected);
      return { correct, explanation: null, correctAnswer: expected };
    }

    // Sentence repeat: self-evaluated. RecordAndEvaluate passes "self_correct"
    // or "self_wrong" as the answer. Treating it as always-correct inflated
    // SM-2 mastery (every repeat pushed quality=5). Now "需练习" → quality 2.
    case "sentence_repeat": {
      const correct = userAnswer === "self_correct";
      return { correct, explanation: null, correctAnswer: expected };
    }

    default:
      return { correct: false, explanation: null, correctAnswer: expected };
  }
}

// ---------------------------------------------------------------------------
// usePractice — video-scoped
// ---------------------------------------------------------------------------

interface UsePracticeOptions {
  videoId: string;
  level: string | null;
}

export interface UsePracticeReturn {
  loading: boolean;
  error: string | null;
  items: PracticeItem[];
  answers: Record<number, string>;
  graded: Record<number, GradedResult>;
  grading: Record<number, boolean>;
  answeredCount: number;
  correctCount: number;
  allGraded: boolean;
  score: number | null;
  accuracy: number | null;
  setAnswer: (index: number, answer: string) => void;
  gradeAnswer: (index: number, answer?: string) => void;
  reset: () => void;
  refetch: () => Promise<void>;
  submitResults: () => Promise<void>;
}

export function usePractice({
  videoId,
  level,
}: UsePracticeOptions): UsePracticeReturn {
  const fetcher = useCallback(async (): Promise<PracticeItem[]> => {
    if (!level) return [];
    const data = await api<UnifiedPracticeSet>(
      `/api/v1/videos/${videoId}/practice?level=${level}`,
    );
    return data.items ?? [];
  }, [videoId, level]);

  const grader = useCallback(
    (item: PracticeItem, userAnswer: string): GradedResult => {
      return gradePracticeItem(item, userAnswer);
    },
    [],
  );

  const session = useSession<PracticeItem>({
    fetcher,
    grader,
    enabled: !!level,
  });

  const submitResults = useCallback(async () => {
    const results = Object.entries(session.graded).map(([idx, gr]) => ({
      word: session.items[Number(idx)]?.word ?? "",
      correct: gr.correct,
    }));
    if (!results.length) return;

    try {
      await api<PracticeSubmitRequest>("/api/v1/videos/practice/submit", {
        method: "POST",
        body: JSON.stringify({ results, video_id: videoId }),
      });
      toast.success("学习记录已更新");
    } catch {
      // Non-blocking — practice results are still visible locally
      toast.error("学习记录同步失败，不影响本次练习");
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
    gradeAnswer: session.gradeAnswer,
    reset: session.reset,
    refetch: session.refetch,
    submitResults,
  };
}

// ---------------------------------------------------------------------------
// useVocabularyPractice — vocabulary-page-scoped
// ---------------------------------------------------------------------------

interface UseVocabularyPracticeOptions {
  level?: string | null;
  count?: number;
  dueOnly?: boolean;
  enabled?: boolean;
}

export interface UseVocabularyPracticeReturn extends Omit<
  UsePracticeReturn,
  "submitResults"
> {
  submitResults: () => Promise<void>;
}

export function useVocabularyPractice({
  level,
  count = 10,
  dueOnly = false,
  enabled = true,
}: UseVocabularyPracticeOptions): UseVocabularyPracticeReturn {
  const fetcher = useCallback(async (): Promise<PracticeItem[]> => {
    const params = new URLSearchParams();
    if (level) params.set("level", level);
    params.set("count", String(count));
    if (dueOnly) params.set("due_only", "true");
    const data = await api<VocabularyPracticeSet>(
      `/api/v1/vocabulary/practice?${params}`,
    );
    return data.items ?? [];
  }, [level, count, dueOnly]);

  const grader = useCallback(
    (item: PracticeItem, userAnswer: string): GradedResult => {
      return gradePracticeItem(item, userAnswer);
    },
    [],
  );

  const session = useSession<PracticeItem>({
    fetcher,
    grader,
    enabled,
  });

  const submitResults = useCallback(async () => {
    const results = Object.entries(session.graded).map(([idx, gr]) => ({
      word: session.items[Number(idx)]?.word ?? "",
      correct: gr.correct,
    }));
    if (!results.length) return;

    try {
      await api("/api/v1/vocabulary/practice/submit", {
        method: "POST",
        body: JSON.stringify({ results }),
      });
      toast.success("学习记录已更新");
    } catch {
      toast.error("学习记录同步失败，不影响本次练习");
    }
  }, [session.graded, session.items]);

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
    gradeAnswer: session.gradeAnswer,
    reset: session.reset,
    refetch: session.refetch,
    submitResults,
  };
}
