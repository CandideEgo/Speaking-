"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PracticeQuestion, PracticeSet } from "@/types";

interface UsePracticeModeOptions {
  videoId: string;
  /** Target exam level key (e.g. "cet4"). Practice set is fetched per level. */
  level: string | null;
}

interface GradedQuestion extends PracticeQuestion {
  userAnswer: string;
  correct: boolean | null;
  explanation: string | null;
}

interface UsePracticeModeReturn {
  loading: boolean;
  error: string | null;
  questions: PracticeQuestion[];
  answers: Record<number, string>;
  setAnswer: (index: number, answer: string) => void;
  graded: GradedQuestion[];
  submitted: boolean;
  score: number | null;
  submitting: boolean;
  fetchPractice: () => Promise<void>;
  submit: () => Promise<void>;
  reset: () => void;
}

/**
 * Practice mode: fetches the AI-generated question set for the current exam
 * level, tracks answers, and grades each answer via the backend (fill-in-the-
 * blank lenient locally, open-ended Q&A by AI). Mirrors useQuiz's shape.
 */
export function usePracticeMode({
  videoId,
  level,
}: UsePracticeModeOptions): UsePracticeModeReturn {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState<GradedQuestion[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPractice = useCallback(async () => {
    if (!level) return;
    setLoading(true);
    setError(null);
    setSubmitted(false);
    setScore(null);
    setGraded([]);
    setAnswers({});
    try {
      const data = await api<PracticeSet>(
        `/api/v1/videos/${videoId}/practice?level=${encodeURIComponent(level)}`,
      );
      setQuestions(data.questions || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "练习题加载失败";
      // 403 -> pro required; surface a friendly message
      if (msg.includes("Pro")) {
        setError("练习模式需要 Pro 订阅。");
      } else {
        setError("练习题加载失败，请稍后重试");
      }
      setQuestions([]);
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

  const submit = useCallback(async () => {
    if (!questions.length) return;
    setSubmitting(true);
    try {
      const results: GradedQuestion[] = [];
      let correctCount = 0;
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const ua = answers[i] || "";
        let correct = false;
        let explanation: string | null = null;
        try {
          const res = await api<{ correct: boolean; explanation: string }>(
            `/api/v1/videos/${videoId}/practice/grade`,
            {
              method: "POST",
              body: JSON.stringify({ question: q, user_answer: ua }),
            },
          );
          correct = res.correct;
          explanation = res.explanation;
        } catch {
          correct = false;
          explanation = "判分失败";
        }
        if (correct) correctCount += 1;
        results.push({ ...q, userAnswer: ua, correct, explanation });
      }
      setGraded(results);
      setScore(Math.round((correctCount / questions.length) * 100));
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [questions, answers, videoId]);

  const reset = useCallback(() => {
    setSubmitted(false);
    setScore(null);
    setGraded([]);
    setAnswers({});
  }, []);

  return {
    loading,
    error,
    questions,
    answers,
    setAnswer,
    graded,
    submitted,
    score,
    submitting,
    fetchPractice,
    submit,
    reset,
  };
}
