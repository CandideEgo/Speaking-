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

export const usePlanStore = create<PlanStore>((set) => ({
  ...INITIAL_STATE,

  async fetchProfile() {
    set({ profileLoading: true });
    try {
      const profile = await api<LearningProfile>("/api/v1/plan/profile");
      set({ profile, profileLoading: false });
    } catch {
      set({ profileLoading: false });
    }
  },

  async refreshProfile() {
    try {
      const profile = await api<LearningProfile>("/api/v1/plan/profile/refresh", {
        method: "POST",
      });
      set({ profile });
    } catch {
      // Silent
    }
  },

  reset() {
    set(INITIAL_STATE);
  },
}));
