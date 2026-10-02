"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { WatchTopBar } from "@/components/layout/WatchTopBar";
import { WatchBottomBar } from "@/components/watch/WatchBottomBar";
import { useWatchChromeValue } from "@/components/watch/WatchChromeProvider";
import { ShellSkeleton } from "@/components/common/ShellSkeleton";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/api";
import { SCROLL_CONTAINER_ID } from "@/lib/scrollMemory";

export function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  // DEC-069 / #31：`/watch/*` 换掉壳的两个栏 —— 底栏槽位给播放控制（替换 5 Tab），
  // 顶栏（仅 ≤1023px，由 WatchTopBar 自己判定）收成 44px 观看页形态。
  // 判定只看 pathname，**不等播放页挂载**，否则首屏会闪一帧 64px 的全局顶栏。
  // 两个 hook 必须无条件调用（在下面的早退分支之前），否则违反 rules-of-hooks。
  const pathname = usePathname();
  const isWatch = pathname.startsWith("/watch/");
  // store 是**单一全局槽位**：非观看页读到的永远是空值（`active` 把读取掐成 EMPTY），
  // 路由切走不会留下上一个播放页的残留 chrome。
  const chrome = useWatchChromeValue(isWatch);

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
  //
  // 观看页的 `main` 不带移动端底部 padding（`pb-16`）：那是给 5 Tab 底栏躲位的，
  // 而观看页的底栏（`WatchBottomBar`）是壳里同一槽位的**常规流**行，已经收在内容之后，
  // 再留 64px 就是一条纯空白（§8 风险表最后一行）。桌面端 `md:pb-0` 的语义（无 padding）
  // 由「不带 pb 类」原样满足；其他路由的 class 字符串一字不改。
  return (
    <div
      className="flex flex-col h-dvh overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {isWatch ? <WatchTopBar chrome={chrome} /> : <TopBar />}
      <main
        id={SCROLL_CONTAINER_ID}
        className={`flex-1 overflow-y-auto custom-scrollbar${isWatch ? "" : " pb-16 md:pb-0"}`}
      >
        {children}
      </main>
      {isWatch ? <WatchBottomBar chrome={chrome} /> : <MobileTabBar />}
    </div>
  );
}
