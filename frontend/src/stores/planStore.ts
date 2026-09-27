"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import type { LearningProfile } from "@/types";

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

interface PlanState {
  profile: LearningProfile | null;
  profileLoading: boolean;
}

interface PlanActions {
  fetchProfile: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  reset: () => void;
}

type PlanStore = PlanState & PlanActions;

const INITIAL_STATE: PlanState = {
  profile: null,
  profileLoading: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Bumped by reset() so a response that a logout has superseded is dropped. */
let generation = 0;

export const usePlanStore = create<PlanStore>((set) => ({
  ...INITIAL_STATE,

  async fetchProfile() {
    const gen = generation;
    set({ profileLoading: true });
    try {
      const profile = await api<LearningProfile>("/api/v1/plan/profile");
      if (gen !== generation) return;
      set({ profile, profileLoading: false });
    } catch (err) {
      if (gen !== generation) return;
      console.error("[planStore] fetchProfile failed", err);
      set({ profileLoading: false });
    }
  },

  async refreshProfile() {
    const gen = generation;
    try {
      const profile = await api<LearningProfile>("/api/v1/plan/profile/refresh", {
        method: "POST",
      });
      if (gen !== generation) return;
      set({ profile });
    } catch (err) {
      if (gen !== generation) return;
      console.error("[planStore] refreshProfile failed", err);
    }
  },

  reset() {
    generation += 1;
    set(INITIAL_STATE);
  },
}));
