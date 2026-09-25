"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { AUTH_COOKIE_NAME, syncAuthCookie } from "@/lib/authHelpers";
import { useAuthStore } from "@/stores/authStore";

/**
 * Recovery screen for the login wall: the user has a valid token in
 * localStorage but `proxy.ts` cannot see the cookie mirror, so every
 * navigation away bounces back to /login. Offer escape actions instead of an
 * eternal spinner (reported as "white screen with a fake loading animation").
 *
 * - 重试进入 re-mirrors the token (best effort — the copy asks the user to
 *   allow cookies, so this click is exactly when that may have just happened)
 *   and then hard-navigates so the middleware re-evaluates with a fresh
 *   cookie. Still missing → it bounces back here rather than spinning.
 * - 重新登录 clears the local token (and blacklists the server session), which
 *   always lands the user back on a working login form. Destructive, so it is
 *   the secondary action.
 */
export function RedirectStuckState({ next }: { next: string }) {
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  // 站点名只有客户端知道；SSR 首帧给空串，避免 hydration 不一致。
  const [host, setHost] = useState("");

  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  function retry() {
    syncAuthCookie(AUTH_COOKIE_NAME, token);
    window.location.assign(next);
  }

  return (
    <AuthCard title="无法进入应用" subtitle="登录状态同步失败">
      <div className="mt-6 space-y-4">
        <div className="flex items-start gap-2.5 rounded-md bg-surface-soft px-3.5 py-3">
          <ShieldAlert size={16} className="text-warning mt-0.5 flex-shrink-0" />
          <p className="text-[13px] text-body leading-relaxed">
            浏览器似乎拦截了本站的登录凭据（cookie），登录状态无法保持。请允许 {host || "本站"} 使用
            cookie 后重试，或重新登录。
          </p>
        </div>
        <div className="flex gap-3">
          <Button fullWidth onClick={retry}>
            重试进入
          </Button>
          <Button fullWidth variant="outline" onClick={() => logout()}>
            重新登录
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
