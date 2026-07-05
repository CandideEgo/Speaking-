"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useAdminAuthStore } from "@/stores/adminAuthStore";
import { adminApi, AdminApiError } from "@/lib/adminApi";

interface LoginResponse {
  token: string;
  refresh_token?: string;
}

// CN mobile pattern — same routing rule as the user-side login page.
const PHONE_RE = /^1[3-9]\d{9}$/;

export default function AdminLoginPage() {
  const router = useRouter();
  const login = useAdminAuthStore((s) => s.login);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      // Route to the phone or email login endpoint based on the identifier,
      // mirroring the user-side login page. Both endpoints return the same
      // TokenResponse; the shell guard verifies role === admin afterward.
      const isPhone = PHONE_RE.test(identifier);
      const path = isPhone ? "/api/v1/auth/phone-login" : "/api/v1/auth/login";
      const body = isPhone
        ? { phone: identifier, password }
        : { email: identifier, password };
      const data = await adminApi<LoginResponse>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      login(data.token, data.refresh_token ?? null);
      // The shell guard verifies role === admin and redirects back here if not.
      toast.success("登录成功");
      router.replace("/admin");
    } catch (err) {
      const msg =
        err instanceof AdminApiError
          ? err.status === 401
            ? "账号或密码错误"
            : err.message
          : "登录失败，请重试";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-dark px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-on-primary text-xl font-extrabold shadow-brand">
            S
          </span>
          <h1 className="mt-4 font-display text-2xl font-medium text-on-dark">
            Speaking 管理后台
          </h1>
          <p className="mt-1 text-sm text-on-dark/60">仅限管理员登录</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-white/10 bg-surface-dark-elevated p-6 shadow-lift"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-on-dark/60">
                手机号或邮箱
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                className="w-full rounded-sm border border-white/10 bg-surface-dark-soft px-3 py-2.5 text-sm text-on-dark placeholder:text-on-dark/40 focus:border-coral focus:outline-none"
                placeholder="手机号或邮箱"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-on-dark/60">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-sm border border-white/10 bg-surface-dark-soft px-3 py-2.5 text-sm text-on-dark placeholder:text-on-dark/40 focus:border-coral focus:outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm bg-coral px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Lock size={16} />
            )}
            {submitting ? "登录中..." : "管理员登录"}
          </button>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-on-dark/40">
            <ShieldCheck size={12} />
            受保护的管理控制台
          </div>
        </form>
      </div>
    </div>
  );
}
