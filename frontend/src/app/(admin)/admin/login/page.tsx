"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Eye, EyeOff, Lock, Phone, ShieldCheck } from "lucide-react";
import { useAdminAuthStore } from "@/stores/adminAuthStore";
import { adminApi } from "@/lib/adminApi";
import { apiErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface LoginResponse {
  token: string;
  refresh_token?: string;
}

/**
 * A-30：登录后回跳 `?next=`，但只接受站内 `/admin` 前缀，避免 open redirect。
 * 拒绝 `//evil.com`、`/\evil.com`、带换行的伪造值，以及会绕回登录页自身的地址。
 */
function resolveAdminNext(raw: string | null): string {
  if (!raw) return "/admin";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/admin";
  if (/[\\\r\n]/.test(raw)) return "/admin";
  const path = raw.split(/[?#]/)[0] ?? "";
  if (path !== "/admin" && !path.startsWith("/admin/")) return "/admin";
  if (path === "/admin/login") return "/admin";
  return raw;
}

/** 从当前地址读 next（登录页自身不读 query 状态，避免额外的 Suspense 边界）。 */
function currentAdminNext(): string {
  if (typeof window === "undefined") return "/admin";
  return resolveAdminNext(new URLSearchParams(window.location.search).get("next"));
}

const LOGIN_ERROR_ID = "admin-login-error";
const PHONE_INPUT_ID = "admin-login-phone";
const PASSWORD_INPUT_ID = "admin-login-password";

export default function AdminLoginPage() {
  const router = useRouter();
  const login = useAdminAuthStore((s) => s.login);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }
    setLoading(true);
    try {
      const data = await adminApi<LoginResponse>("/api/v1/auth/phone-login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      login(data.token, data.refresh_token ?? null);
      router.replace(currentAdminNext());
    } catch (err) {
      setError(apiErrorMessage(err, "登录失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh bg-surface-soft">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] relative overflow-hidden bg-surface-dark flex-col justify-between p-12">
        {/* Decorative elements */}
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-brand-500/15 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-indigo/10 blur-[100px]" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-brand-400/5 blur-[80px]" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-lg" />
          <div>
            <span className="font-display text-title font-bold text-on-dark tracking-tight block">
              SeeWord
            </span>
            <span className="text-caption uppercase tracking-widest text-on-dark-soft">
              Admin Console
            </span>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <h2 className="display-lg text-on-dark">
            管理后台
            <br />
            <span className="text-brand-400">运营控制中心</span>
          </h2>
          <div className="space-y-4">
            {[
              { icon: ShieldCheck, text: "用户与权限管理" },
              { icon: Eye, text: "内容审核与发布" },
              { icon: Lock, text: "数据统计与分析" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
                  <f.icon size={16} className="text-brand-400" />
                </div>
                <span className="text-copy text-on-dark-soft">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-meta text-on-dark-soft/50">SeeWord Admin v2.0</p>
        </div>
      </div>

      {/* Right form area */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <Image
              src="/logo.png"
              alt=""
              width={48}
              height={48}
              className="mx-auto mb-3 h-12 w-12 rounded-lg"
            />
            <h1 className="font-display text-title font-bold text-ink">SeeWord 管理后台</h1>
          </div>

          {/* Header */}
          <div className="hidden lg:block mb-8">
            <h1 className="font-display text-display-sm font-bold text-ink tracking-tight">
              管理员登录
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-copy text-muted">
              <ShieldCheck size={14} className="text-brand-500" />
              仅限授权管理员访问
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor={PHONE_INPUT_ID}
                className="block text-copy font-medium text-ink mb-1.5"
              >
                手机号
              </label>
              <div className="relative">
                <Phone
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft"
                  aria-hidden
                />
                <input
                  id={PHONE_INPUT_ID}
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  required
                  autoComplete="tel"
                  placeholder="请输入手机号"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? LOGIN_ERROR_ID : undefined}
                  className={cn(
                    "w-full rounded-lg border border-hairline bg-canvas py-2.5 pl-10 pr-4 text-copy text-ink",
                    "placeholder:text-muted-soft",
                    "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
                    "transition-colors"
                  )}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor={PASSWORD_INPUT_ID}
                className="block text-copy font-medium text-ink mb-1.5"
              >
                密码
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft"
                  aria-hidden
                />
                <input
                  id={PASSWORD_INPUT_ID}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? LOGIN_ERROR_ID : undefined}
                  className={cn(
                    "w-full rounded-lg border border-hairline bg-canvas py-2.5 pl-10 pr-10 text-copy text-ink",
                    "placeholder:text-muted-soft",
                    "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
                    "transition-colors"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-soft hover:text-ink transition-colors"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
            </div>

            {error && (
              <div
                id={LOGIN_ERROR_ID}
                role="alert"
                className="rounded-lg bg-error/10 px-4 py-2.5 text-copy text-error-text"
              >
                {error}
              </div>
            )}

            <Button type="submit" fullWidth disabled={loading} className="mt-2 h-11">
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>

          {/* Back link */}
          <div className="mt-8 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-copy text-muted hover:text-ink transition-colors"
            >
              <ArrowLeft size={14} />
              返回用户端
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
