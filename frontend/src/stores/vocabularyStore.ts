import { create } from "zustand";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────

export interface VocabStats {
  total: number;
  new_count: number;
  learning_count: number;
  reviewing_count: number;
  mastered_count: number;
  /** Legacy badge count (folds new words in). UI should use due_review_count. */
  due_count: number;
  /** Canonical review queue (excludes new/mastered). */
  due_review_count: number;
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
    due_review_count: 0,
  },
};

/** Bumped by reset() so a response that a logout has superseded is dropped. */
let generation = 0;

export const useVocabularyStore = create<VocabularyStore>((set) => ({
  ...INITIAL_STATE,

  async fetchStats() {
    const gen = generation;
    try {
      const data = await api<VocabStats>("/api/v1/vocabulary/stats");
      if (gen !== generation) return;
      set({
        stats: {
          ...data,
          // Older backends only ship due_count; fall back so the badge is not
          // stuck at 0 during a rolling deploy.
          due_review_count: data.due_review_count ?? data.due_count,
        },
      });
    } catch (err) {
      if (gen !== generation) return;
      console.error("[vocabularyStore] fetchStats failed", err);
    }
  },

  reset() {
    generation += 1;
    set(INITIAL_STATE);
  },
}));
