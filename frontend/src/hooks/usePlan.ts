"use client";

import { useEffect } from "react";
import { usePlanStore } from "@/stores/planStore";
import { useAuthStore } from "@/stores/authStore";

/**
 * Hook to fetch the user's learning profile.
 * Automatically fetches when the user is authenticated.
 */
export function usePlan() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profile = usePlanStore((s) => s.profile);
  const profileLoading = usePlanStore((s) => s.profileLoading);
  const fetchProfile = usePlanStore((s) => s.fetchProfile);

  useEffect(() => {
    if (isAuthenticated && !profile && !profileLoading) {
      fetchProfile();
    }
  }, [isAuthenticated, profile, profileLoading, fetchProfile]);

  return {
    profile,
    profileLoading,
    fetchProfile,
  };
}
