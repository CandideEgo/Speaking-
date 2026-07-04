"use client";

import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";
import { LandingContent } from "@/components/landing/LandingContent";

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();

  // Spinner while auth state is initializing, or while redirecting an
  // already-authenticated visitor to the app.
  if (isLoading || isAuthenticated) {
    return <FullPageSpinner />;
  }

  return <LandingContent />;
}
