"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { VocabDrillItem, VocabDrillSet } from "@/types";

interface UseVocabDrillOptions {
  videoId: string;
  level: string | null;
}

interface GradedItem extends VocabDrillItem {
  userAnswer: string;
  correct: boolean;
}

interface UseVocabDrillReturn {
  loading: boolean;
  error: string | null;
  items: VocabDrillItem[];
  answers: Record<number, string>;
  setAnswer: (index: number, answer: string) => void;
  graded: GradedItem[];
  submitted: boolean;
  score: number | null;
  fetchDrill: () => Promise<void>;
  submit: () => void;
  reset: () => void;
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
 * for the current exam level (free-tier, no AI) and grades locally.
 *
 * Mirrors usePracticeMode's shape so it slots into the same section component
 * pattern, but grading is fully client-side (no /practice/grade call).
 */
export function useVocabDrill({
  videoId,
  level,
}: UseVocabDrillOptions): UseVocabDrillReturn {
  const [items, setItems] = useState<VocabDrillItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState<GradedItem[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDrill = useCallback(async () => {
    if (!level) return;
    setLoading(true);
    setError(null);
    setSubmitted(false);
    setScore(null);
    setGraded([]);
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

  const submit = useCallback(() => {
    if (!items.length) return;
    const results: GradedItem[] = [];
    let correctCount = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const ua = answers[i] || "";
      let correct = false;
      if (it.kind === "spelling") {
        correct = normalizeWord(ua) === normalizeWord(it.answer);
      } else {
        // meaning_choice: answer is the correct option string.
        correct = (ua || "").trim() === (it.answer || "").trim();
      }
      if (correct) correctCount += 1;
      results.push({ ...it, userAnswer: ua, correct });
    }
    setGraded(results);
    setScore(Math.round((correctCount / items.length) * 100));
    setSubmitted(true);
  }, [items, answers]);

  const reset = useCallback(() => {
    setSubmitted(false);
    setScore(null);
    setGraded([]);
    setAnswers({});
  }, []);

  return {
    loading,
    error,
    items,
    answers,
    setAnswer,
    graded,
    submitted,
    score,
    fetchDrill,
    submit,
    reset,
  };
}
