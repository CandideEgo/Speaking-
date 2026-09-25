/**
 * useRequireAuth — guard hook for pages that require authentication.
 *
 * Centralizes the "redirect to login if unauthenticated" pattern duplicated
 * across 11+ page components. Returns { isAuthenticated, isLoading } so
 * pages can still gate data-loading on auth status.
 *
 * Usage (simple guard — just redirect + spinner):
 *   const { isAuthenticated, isLoading } = useRequireAuth();
 *   if (isLoading || !isAuthenticated) return <FullPageSpinner />;
 *
 * Usage (guard + data load on auth):
 *   const { isAuthenticated, isLoading } = useRequireAuth();
 *   useEffect(() => {
 *     if (isLoading || !isAuthenticated) return;
 *     loadData();
 *   }, [isAuthenticated, isLoading]);
 *
 * The hook fires the redirect as a side effect — no need for separate
 * useEffect in the page component just for the auth redirect.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_COOKIE_NAME, hasAuthCookieMirror } from "@/lib/authHelpers";
import { useAuthStore } from "@/stores/authStore";

interface UseRequireAuthOptions {
  /** URL to redirect to when not authenticated. Default: "/login" */
  redirectTo?: string;
  /** Use router.replace instead of router.push. Default: false */
  replace?: boolean;
}

interface UseRequireAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useRequireAuth(options: UseRequireAuthOptions = {}): UseRequireAuthReturn {
  const { redirectTo = "/login", replace = false } = options;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      if (replace) {
        router.replace(redirectTo);
      } else {
        router.push(redirectTo);
      }
    }
  }, [isAuthenticated, isLoading, redirectTo, replace, router]);

  return { isAuthenticated, isLoading };
}

export interface UseRedirectIfAuthenticatedReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * true 表示：本地已登录，但登录墙看不到镜像 cookie，跳过去必被弹回。
   * 调用方应渲染恢复 UI 而非 spinner。
   */
  redirectStuck: boolean;
}

/**
 * useRedirectIfAuthenticated — reverse guard for login/register/landing pages.
 *
 * Redirects authenticated users away to the app home. (Was /dashboard; the
 * dashboard is being removed per ADR-0003, so the app entry is now `/`.)
 *
 * `redirectStuck` 的判定是**同步读镜像 cookie**，不是计时：
 * `proxy.ts`（D0 登录墙）的门控谓词只有「cookie 存在且非空」一条 —— 不解码
 * JWT、不查库 —— 所以客户端读 `document.cookie` 就能复算出 middleware 的
 * 判决，无需先发一次注定被弹回的跳转、再等它失败。缺失时直接不跳，让调用方
 * 渲染恢复卡（`RedirectStuckState`）。
 *
 * 为什么缺失必然是「浏览器拒绝了写入」而不是「cookie 过期」：
 * `authStore.initialize()`（`stores/authStore.ts:266`）每次页面加载都会用有效
 * token 重新镜像，cookie 被单独清除的情况会自愈。故持续缺失 ⟺ 写不进去。
 *
 * 注意本 hook 只在 effect 里读 cookie，不在 render 期读：`initialize()` 是先
 * `set(...)` 再 `syncAuthCookie(...)`，render 期读会依赖 React 的批处理时机。
 */
export function useRedirectIfAuthenticated(redirectTo = "/"): UseRedirectIfAuthenticatedReturn {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();
  const [redirectStuck, setRedirectStuck] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setRedirectStuck(false);
      return;
    }
    // 跳过去也会被登录墙弹回，所以不跳 —— 零次无谓导航。
    if (!hasAuthCookieMirror(AUTH_COOKIE_NAME)) {
      setRedirectStuck(true);
      return;
    }
    setRedirectStuck(false);
    router.replace(redirectTo);
  }, [isAuthenticated, isLoading, redirectTo, router]);

  return { isAuthenticated, isLoading, redirectStuck };
}
