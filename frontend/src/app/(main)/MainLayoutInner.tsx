"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { FullPageSpinner } from "@/components/common/Spinner";
import { LandingContent } from "@/components/landing/LandingContent";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/api";

export function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  // 未认证 → 渲染公开落地页（ADR-0005：未登录 `/` → 落地页，而非裸跳 /login）。
  // 落地页自身可滚动，所以只在已认证的 shell 模式下锁 <html> 滚动。
  // shell 模式是单页式，由内部 <main> 负责滚动；不锁的话内容溢出会泄漏到 <html>，
  // 产生额外的浏览器滚动条和底部留白（播放页尤为明显）。
  useEffect(() => {
    if (!isAuthenticated) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [isAuthenticated]);

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

  // Spinner while auth state is initializing
  if (isLoading) {
    return <FullPageSpinner />;
  }

  // Unauthenticated visitors see the public landing page (with login/register CTAs)
  // instead of being bounced to a bare login form.
  if (!isAuthenticated) {
    return <LandingContent />;
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
