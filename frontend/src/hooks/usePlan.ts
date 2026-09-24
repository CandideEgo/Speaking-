"use client";

import { useEffect, useRef } from "react";
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
  const attempted = useRef(false);

  useEffect(() => {
    // A failed fetch leaves `profile` null and flips `profileLoading` back to false,
    // and both are dependencies of this effect — without the attempted guard the
    // false -> true -> false transition re-runs it and re-fetches forever.
    if (!isAuthenticated) {
      attempted.current = false;
      return;
    }
    if (attempted.current || profile || profileLoading) return;
    attempted.current = true;
    fetchProfile();
  }, [isAuthenticated, profile, profileLoading, fetchProfile]);

  return {
    profile,
    profileLoading,
    fetchProfile,
  };
}
