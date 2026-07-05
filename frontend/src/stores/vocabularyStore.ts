import { create } from "zustand";
import { api } from "@/lib/api";
import type { VocabularyWord } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────

interface VocabStats {
  total: number;
  new_count: number;
  learning_count: number;
  reviewing_count: number;
  mastered_count: number;
  due_count: number;
}

interface VocabularyState {
  words: VocabularyWord[];
  stats: VocabStats;
  loading: boolean;
  activeTab: "all" | "due";
  isLoading: boolean;
}

interface VocabularyActions {
  fetchWords: (dueOnly?: boolean) => Promise<void>;
  fetchStats: () => Promise<void>;
  deleteWord: (wordId: string) => Promise<void>;
  reviewWord: (wordId: string, quality: number) => Promise<void>;
  setActiveTab: (tab: "all" | "due") => void;
  /** Reset all state to initial values (called on logout) */
  reset: () => void;
}

type VocabularyStore = VocabularyState & VocabularyActions;

// ── Store ────────────────────────────────────────────────────────────────

const INITIAL_STATE: VocabularyState = {
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
  isLoading: false,
};

export const useVocabularyStore = create<VocabularyStore>((set, get) => ({
  ...INITIAL_STATE,

  async fetchWords(dueOnly = false) {
    set({ loading: true });
    try {
      const params = dueOnly ? "?due_only=true" : "";
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
      get().fetchWords();
    } catch (err) {
      throw err;
    }
  },

  setActiveTab(tab: "all" | "due") {
    set({ activeTab: tab });
  },

  reset() {
    set(INITIAL_STATE);
  },
}));
