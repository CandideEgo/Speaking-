"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import type { TodayPlanResponse, DailyProgress, LearningProfile } from "@/types";

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

interface PlanState {
  todayPlan: TodayPlanResponse | null;
  loading: boolean;
  error: string | null;
  generating: boolean;
}

interface PlanActions {
  fetchTodayPlan: () => Promise<void>;
  completeItem: (itemId: string, result?: { correct: number; total: number }) => Promise<void>;
  generateAIPlan: () => Promise<void>;
  refreshProgress: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  reset: () => void;
}

type PlanStore = PlanState & PlanActions;

const INITIAL_STATE: PlanState = {
  todayPlan: null,
  loading: false,
  error: null,
  generating: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlanStore = create<PlanStore>((set, get) => ({
  ...INITIAL_STATE,

  async fetchTodayPlan() {
    set({ loading: true, error: null });
    try {
      const data = await api<TodayPlanResponse>("/api/v1/plan/today");
      set({ todayPlan: data, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "加载计划失败",
      });
    }
  },

  async completeItem(itemId, result) {
    try {
      const body = result ? { result } : {};
      await api(`/api/v1/plan/items/${itemId}/complete`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Re-fetch to get updated progress
      await get().fetchTodayPlan();
    } catch (e) {
      // Silently fail — completion is best-effort
      console.error("Failed to complete plan item:", e);
    }
  },

  async generateAIPlan() {
    if (get().generating) return;
    set({ generating: true });
    try {
      await api("/api/v1/plan/generate/ai", { method: "POST" });
      await get().fetchTodayPlan();
    } catch (e) {
      console.error("AI plan generation failed:", e);
    } finally {
      set({ generating: false });
    }
  },

  async refreshProgress() {
    try {
      const progress = await api<DailyProgress>("/api/v1/plan/progress");
      const current = get().todayPlan;
      if (current) {
        set({ todayPlan: { ...current, progress } });
      }
    } catch {
      // Silent
    }
  },

  async refreshProfile() {
    try {
      const profile = await api<LearningProfile>("/api/v1/plan/profile/refresh", {
        method: "POST",
      });
      const current = get().todayPlan;
      if (current) {
        set({ todayPlan: { ...current, profile } });
      }
    } catch {
      // Silent
    }
  },

  reset() {
    set(INITIAL_STATE);
  },
}));
