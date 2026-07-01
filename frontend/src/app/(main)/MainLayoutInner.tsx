"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { FullPageSpinner } from "@/components/common/Spinner";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { api } from "@/lib/api";

export function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth({ replace: true });
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  // 锁住 <html> 滚动：(main) 布局是单页式，由内部 <main> 负责滚动。
  // 不锁的话，<main> 内容溢出会泄漏到 <html>，产生额外的浏览器滚动条
  // 和页面底部留白（播放页尤为明显）。仅在此布局生效，login/landing 不受影响。
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);

  // Onboarding redirect: after auth, check user.onboarding_completed
  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      setCheckedOnboarding(false);
      return;
    }

    let cancelled = false;

    async function checkOnboarding() {
      try {
        const user = await api<{ onboarding_completed?: boolean }>(
          "/api/v1/users/me",
        );
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
        <main className="flex-1 overflow-y-auto custom-scrollbar pb-16 md:pb-0">
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
