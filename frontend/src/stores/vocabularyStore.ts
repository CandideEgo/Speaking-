import { create } from "zustand";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────

export interface VocabStats {
  total: number;
  new_count: number;
  learning_count: number;
  reviewing_count: number;
  mastered_count: number;
  due_count: number;
}

interface VocabularyState {
  stats: VocabStats;
}

interface VocabularyActions {
  fetchStats: () => Promise<void>;
  /** Reset all state to initial values (called on logout) */
  reset: () => void;
}

type VocabularyStore = VocabularyState & VocabularyActions;

// ── Store ────────────────────────────────────────────────────────────────
// Stats-only: word CRUD/review flows use local page state + direct api calls
// (the vocabulary page), so this store carries just the shared due-count badge
// consumed by TopBar / MobileTabBar.

const INITIAL_STATE: VocabularyState = {
  stats: {
    total: 0,
    new_count: 0,
    learning_count: 0,
    reviewing_count: 0,
    mastered_count: 0,
    due_count: 0,
  },
};

export const useVocabularyStore = create<VocabularyStore>((set) => ({
  ...INITIAL_STATE,

  async fetchStats() {
    try {
      const data = await api<VocabStats>("/api/v1/vocabulary/stats");
      set({ stats: data });
    } catch {
      // Keep existing stats on error
    }
  },

  reset() {
    set(INITIAL_STATE);
  },
}));
