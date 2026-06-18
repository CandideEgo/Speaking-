'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { QuizQuestion } from '@/types';

interface UseQuizOptions {
  videoId: string;
}

interface UseQuizReturn {
  quizQuestions: QuizQuestion[];
  quizAnswers: Record<number, string>;
  quizSubmitted: boolean;
  quizScore: number | null;
  handleQuizAnswer: (questionIndex: number, answer: string) => void;
  submitQuiz: () => Promise<void>;
}

/**
 * Hook for quiz/assessment state on the watch page.
 * Manages: fetching quiz questions, tracking answers, scoring, and submission.
 */
export function useQuiz({ videoId }: UseQuizOptions): UseQuizReturn {
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);

  // Fetch quiz questions
  useEffect(() => {
    api<{ quiz: QuizQuestion[] }>(`/api/v1/videos/${videoId}/quiz`)
      .then((data) => setQuizQuestions(data.quiz || []))
      .catch(() => { /* quiz not available */ });
  }, [videoId]);

  const handleQuizAnswer = useCallback((questionIndex: number, answer: string) => {
    setQuizAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  }, []);

  const submitQuiz = useCallback(async () => {
    const correct = quizQuestions.filter((q, i) => {
      const ua = (quizAnswers[i] || '').trim().toLowerCase();
      return ua === q.answer.trim().toLowerCase();
    }).length;
    const score = Math.round((correct / quizQuestions.length) * 100);
    setQuizScore(score);
    setQuizSubmitted(true);
    try {
      const form = new FormData();
      form.append('score', String(score));
      await api(`/api/v1/videos/${videoId}/quiz/submit`, {
        method: 'POST',
        body: form,
        headers: {} as Record<string, string>,
      });
    } catch { /* ignore submission errors */ }
  }, [quizQuestions, quizAnswers, videoId]);

  return {
    quizQuestions,
    quizAnswers,
    quizSubmitted,
    quizScore,
    handleQuizAnswer,
    submitQuiz,
  };
}
