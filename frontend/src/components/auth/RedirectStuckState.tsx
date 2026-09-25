"use client";

import { ShieldAlert } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";

/**
 * Recovery screen for the login/register redirect loop: the user has a valid
 * token in localStorage but the middleware cookie mirror is missing, so every
 * redirect away bounces back to /login and the page would otherwise show a
 * FullPageSpinner forever (reported as "white screen with a fake loading
 * animation"). Offer escape actions instead.
 *
 * - 重新登录 clears the local token (and blacklists the server session), which
 *   always lands the user back on a working login form.
 * - 重试进入 re-runs the middleware via a hard navigation; if the cookie is
 *   still missing it bounces back here instead of spinning.
 */
export function RedirectStuckState({ next }: { next: string }) {
  const logout = useAuthStore((s) => s.logout);
  return (
    <AuthCard title="无法进入应用" subtitle="登录状态同步失败">
      <div className="mt-6 space-y-4">
        <div className="flex items-start gap-2.5 rounded-md bg-surface-soft px-3.5 py-3">
          <ShieldAlert size={16} className="text-warning mt-0.5 flex-shrink-0" />
          <p className="text-[13px] text-body leading-relaxed">
            浏览器似乎拦截了本站的登录凭据（cookie），登录状态无法保持。 请允许 seeword.top 使用
            cookie 后重试，或重新登录。
          </p>
        </div>
        <div className="flex gap-3">
          <Button fullWidth onClick={() => logout()}>
            重新登录
          </Button>
          <Button fullWidth variant="outline" onClick={() => window.location.assign(next)}>
            重试进入
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
