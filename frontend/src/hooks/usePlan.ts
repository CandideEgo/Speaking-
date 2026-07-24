"use client";

import { useEffect } from "react";
import { usePlanStore } from "@/stores/planStore";
import { useAuthStore } from "@/stores/authStore";

/**
 * Hook to fetch and manage the daily learning plan.
 * Automatically fetches when the user is authenticated.
 */
export function usePlan() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const todayPlan = usePlanStore((s) => s.todayPlan);
  const loading = usePlanStore((s) => s.loading);
  const error = usePlanStore((s) => s.error);
  const generating = usePlanStore((s) => s.generating);
  const fetchTodayPlan = usePlanStore((s) => s.fetchTodayPlan);
  const completeItem = usePlanStore((s) => s.completeItem);
  const generateAIPlan = usePlanStore((s) => s.generateAIPlan);
  const refreshProgress = usePlanStore((s) => s.refreshProgress);

  useEffect(() => {
    if (isAuthenticated && !todayPlan && !loading) {
      fetchTodayPlan();
    }
  }, [isAuthenticated, todayPlan, loading, fetchTodayPlan]);

  return {
    plan: todayPlan?.plan ?? null,
    progress: todayPlan?.progress ?? null,
    profile: todayPlan?.profile ?? null,
    loading,
    error,
    generating,
    fetchTodayPlan,
    completeItem,
    generateAIPlan,
    refreshProgress,
  };
}
