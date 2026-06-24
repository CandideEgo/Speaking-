"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/api";

function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}

export function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  // Auth guard: redirect unauthenticated users to login page
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Onboarding redirect: after auth, check user.onboarding_completed
  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      setCheckedOnboarding(false);
      return;
    }

    let cancelled = false;

    async function checkOnboarding() {
      try {
        const user = await api<{ onboarding_completed?: boolean }>("/api/v1/users/me");
        if (!cancelled && user.onboarding_completed === false) {
          router.replace("/onboarding");
        }
      } catch {
        // If API fails, don't block the user
      } finally {
        if (!cancelled) setCheckedOnboarding(true);
      }
    }

    checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, router]);

  // Show spinner while loading or unauthenticated (before redirect fires)
  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  // Show spinner while checking onboarding status
  if (!checkedOnboarding) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto custom-scrollbar pb-16 md:pb-0">{children}</main>
      </div>
      <MobileTabBar />
    </div>
  );
}
