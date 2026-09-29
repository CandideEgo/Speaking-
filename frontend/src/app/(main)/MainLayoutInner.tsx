"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { ShellSkeleton } from "@/components/common/ShellSkeleton";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/api";
import { SCROLL_CONTAINER_ID } from "@/lib/scrollMemory";

export function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  // Onboarding redirect: after auth, check user.onboarding_completed
  // Non-blocking: render the shell immediately, redirect in background.
  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      setCheckedOnboarding(true);
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

  // Skeleton while auth state is initializing (replaces jarring FullPageSpinner)
  if (isLoading) {
    return <ShellSkeleton />;
  }

  // D0 登录墙：受保护路由已被 middleware 302 到 /login；能走到这里的未登录访问
  // 只剩白名单页（/redeem、/upgrade 等），直接渲染页面内容（不带应用 shell）。
  if (!isAuthenticated) {
    return <div className="min-h-dvh bg-canvas">{children}</div>;
  }

  // Render shell immediately — onboarding check runs in background
  // 壳自己扛安全区：viewport-fit=cover 后页面会铺到刘海 / Home indicator 下，
  // 用 padding 把可视区推回安全区内（底部导航是 fixed，另有一份自己的 padding）。
  return (
    <div
      className="flex flex-col h-dvh overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <TopBar />
      <main
        id={SCROLL_CONTAINER_ID}
        className="flex-1 overflow-y-auto custom-scrollbar pb-16 md:pb-0"
      >
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}
