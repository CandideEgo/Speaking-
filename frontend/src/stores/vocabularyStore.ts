import { create } from "zustand";
import { api } from "@/lib/api";
import type { VocabularyWord, VocabQuizQuestion, QuizType } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────

interface VocabStats {
  total: number;
  new_count: number;
  learning_count: number;
  reviewing_count: number;
  mastered_count: number;
  due_count: number;
}

interface QuizSession {
  questions: VocabQuizQuestion[];
  total_questions: number;
}

interface QuizResult {
  score: number;
  total: number;
  results: {
    question_id: string;
    correct: boolean;
    user_answer: string;
    correct_answer: string;
  }[];
}

interface QuizQuestionSimple {
  id: string;
  word: string;
  options: string[];
  correct_answer_index: number;
}

interface VocabularyState {
  words: VocabularyWord[];
  stats: VocabStats;
  loading: boolean;
  activeTab: "all" | "due" | "quiz";
  // Quiz state (simple quiz used by vocabulary page)
  quizQuestions: QuizQuestionSimple[];
  quizIndex: number;
  quizScore: number;
  quizCompleted: boolean;
  // Advanced quiz state (used by VocabQuizPanel component)
  quizSession: QuizSession | null;
  quizAnswers: Record<number, string>;
  quizResult: QuizResult | null;
  quizType: QuizType;
  isQuizActive: boolean;
  isQuizSubmitting: boolean;
  isLoading: boolean;
}

interface VocabularyActions {
  fetchWords: (dueOnly?: boolean) => Promise<void>;
  fetchStats: () => Promise<void>;
  deleteWord: (wordId: string) => Promise<void>;
  reviewWord: (wordId: string, quality: number) => Promise<void>;
  setActiveTab: (tab: "all" | "due" | "quiz") => void;
  // Simple quiz (vocabulary page)
  answerQuiz: (questionId: string, answerIndex: number) => void;
  resetQuiz: () => void;
  // Advanced quiz (VocabQuizPanel)
  startQuiz: (type?: QuizType) => Promise<void>;
  answerQuestion: (index: number, answer: string) => void;
  submitQuiz: () => Promise<void>;
}

type VocabularyStore = VocabularyState & VocabularyActions;

// ── Store ────────────────────────────────────────────────────────────────

export const useVocabularyStore = create<VocabularyStore>((set, get) => ({
  words: [],
  stats: {
    total: 0,
    new_count: 0,
    learning_count: 0,
    reviewing_count: 0,
    mastered_count: 0,
    due_count: 0,
  },
  loading: false,
  activeTab: "all",
  // Simple quiz
  quizQuestions: [],
  quizIndex: 0,
  quizScore: 0,
  quizCompleted: false,
  // Advanced quiz
  quizSession: null,
  quizAnswers: {},
  quizResult: null,
  quizType: "multiple_choice",
  isQuizActive: false,
  isQuizSubmitting: false,
  isLoading: false,

  async fetchWords(dueOnly = false) {
    set({ loading: true });
    try {
      const params = dueOnly ? "?due_only=true" : "";
      // 后端返回 { words, stats }，非裸数组
      const data = await api<{ words: VocabularyWord[] }>(
        `/api/v1/vocabulary${params}`,
      );
      set({ words: data.words, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async fetchStats() {
    try {
      const data = await api<VocabStats>("/api/v1/vocabulary/stats");
      set({ stats: data });
    } catch {
      // Keep existing stats on error
    }
  },

  async deleteWord(wordId: string) {
    try {
      await api(`/api/v1/vocabulary/${wordId}`, { method: "DELETE" });
      set((s) => ({
        words: s.words.filter((w) => w.id !== wordId),
      }));
    } catch (err) {
      throw err;
    }
  },

  async reviewWord(wordId: string, quality: number) {
    try {
      await api(`/api/v1/vocabulary/${wordId}/review?quality=${quality}`, {
        method: "POST",
      });
      // Refresh words to get updated review state
      get().fetchWords();
    } catch (err) {
      throw err;
    }
  },

  setActiveTab(tab: "all" | "due" | "quiz") {
    set({ activeTab: tab });
    if (tab === "quiz" && get().quizQuestions.length === 0) {
      get().startQuiz();
    }
  },

  // ── Simple quiz (vocabulary page) ────────────────────────────────────

  answerQuiz(questionId: string, answerIndex: number) {
    const state = get();
    const question = state.quizQuestions[state.quizIndex];
    if (!question) return;

    const isCorrect = answerIndex === question.correct_answer_index;
    const newIndex = state.quizIndex + 1;
    const newScore = state.quizScore + (isCorrect ? 1 : 0);
    const completed = newIndex >= state.quizQuestions.length;

    set({
      quizIndex: newIndex,
      quizScore: newScore,
      quizCompleted: completed,
    });
  },

  resetQuiz() {
    set({
      quizQuestions: [],
      quizIndex: 0,
      quizScore: 0,
      quizCompleted: false,
      quizSession: null,
      quizAnswers: {},
      quizResult: null,
      isQuizActive: false,
      isQuizSubmitting: false,
    });
  },

  // ── Advanced quiz (VocabQuizPanel) ───────────────────────────────────

  async startQuiz(type: QuizType = "multiple_choice") {
    set({ isLoading: true, quizType: type, quizAnswers: {}, quizResult: null });
    try {
      const questions = await api<VocabQuizQuestion[]>(
        "/api/v1/vocabulary/quiz",
        {
          method: "POST",
          body: JSON.stringify({ quiz_type: type, count: 10, due_only: false }),
        },
      );
      const session: QuizSession = {
        questions,
        total_questions: questions.length,
      };
      set({
        quizSession: session,
        isQuizActive: true,
        isLoading: false,
        // Also populate simple quiz fields for the vocabulary page
        quizQuestions: questions.map((q) => ({
          id: q.id,
          word: q.word,
          options: q.options ?? [],
          correct_answer_index: q.correct_answer_index ?? 0,
        })),
        quizIndex: 0,
        quizScore: 0,
        quizCompleted: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  answerQuestion(index: number, answer: string) {
    set((s) => ({
      quizAnswers: { ...s.quizAnswers, [index]: answer },
    }));
  },

  async submitQuiz() {
    const state = get();
    if (!state.quizSession) return;

    set({ isQuizSubmitting: true });
    try {
      const questions = state.quizSession?.questions ?? state.quizQuestions;
      const answers = Object.entries(state.quizAnswers).map(([idx, answer]) => {
        const q = questions[Number(idx)];
        return {
          question_id: q?.id ?? "",
          answer,
        };
      });

      const result = await api<QuizResult>("/api/v1/vocabulary/quiz/submit", {
        method: "POST",
        body: JSON.stringify({ answers }),
      });

      set({
        quizResult: result,
        isQuizSubmitting: false,
        quizCompleted: true,
        quizScore: result.score,
      });
    } catch {
      set({ isQuizSubmitting: false });
    }
  },
}));
