"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { safeNext } from "@/lib/authHelpers";
import { useAuthStore } from "@/stores/authStore";
import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";
import { useSmsCode } from "@/hooks/useSmsCode";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthenticatedRedirect } from "@/components/auth/AuthenticatedRedirect";
import { SmsOtpInput } from "@/components/auth/SmsOtpInput";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

type LoginMode = "code" | "password";

// 生产短信验证码为 4 位；后端兼容 4–6 位。
const OTP_LENGTH = 4;

// D0 登录墙：未登录被 middleware 302 到 /login?next=…，登录成功后跳回原页。
// useSearchParams 需要 Suspense 包裹（客户端页面静态预渲染约束）。
export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const login = useAuthStore((s) => s.login);
  const { isAuthenticated, isLoading, redirectStuck } = useRedirectIfAuthenticated(next);

  const [mode, setMode] = useState<LoginMode>("code");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const { cooldown, sending, sendCode, error: smsError } = useSmsCode();

  const code = otp.join("");

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isAuthenticated) {
    return <AuthenticatedRedirect redirectStuck={redirectStuck} next={next} />;
  }

  async function handleSendCode() {
    setError("");
    const sent = await sendCode(phone, "auth");
    if (sent) setFocusSignal((n) => n + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }
    setLoading(true);
    try {
      if (mode === "code") {
        const res = await api<{
          token: string;
          refresh_token: string;
          is_new_user: boolean;
          user: { onboarding_completed: boolean };
        }>("/api/v1/auth/sms/login", {
          method: "POST",
          body: JSON.stringify({ phone, code }),
        });
        login(res.token, res.refresh_token);
        const needsOnboarding = res.is_new_user || !res.user.onboarding_completed;
        const dest = needsOnboarding ? "/onboarding" : next;
        if (res.is_new_user) {
          // 验证码登录首次建号：先设置登录密码（可跳过），再进入引导/原页。
          router.replace(`/set-password?from=login&next=${encodeURIComponent(dest)}`);
        } else {
          router.replace(dest);
        }
      } else {
        const res = await api<{ token: string; refresh_token: string }>(
          "/api/v1/auth/phone-login",
          {
            method: "POST",
            body: JSON.stringify({ phone, password }),
          }
        );
        login(res.token, res.refresh_token);
        router.replace(next);
      }
    } catch (err) {
      setError(apiErrorMessage(err, "登录失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="欢迎回来" subtitle="登录账号，继续今天的学习。">
      <div className="mt-2 grid grid-cols-2 rounded-lg bg-surface-soft p-1" role="tablist">
        {(
          [
            { value: "code", label: "验证码登录" },
            { value: "password", label: "密码登录" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={mode === tab.value}
            onClick={() => {
              setMode(tab.value);
              setError("");
            }}
            className={cn(
              "rounded-md px-3 py-2 text-copy font-medium transition-colors",
              mode === tab.value
                ? "bg-surface-card text-ink shadow-sm"
                : "text-muted hover:text-ink"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="block text-copy font-medium text-ink">手机号</label>
          {/* +86 前缀（原型 01）：整组 focus 态由 Input 自身承担 */}
          <div className="mt-1.5 flex items-stretch">
            <span className="inline-flex items-center px-3.5 text-copy font-medium text-body bg-surface-card border border-r-0 border-hairline rounded-l-md select-none">
              +86
            </span>
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              required
              className="rounded-l-none flex-1"
              placeholder="请输入手机号"
            />
          </div>
        </div>

        {mode === "code" ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span id="login-otp-label" className="text-copy font-medium text-ink">
                验证码
              </span>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sending || cooldown > 0 || phone.length !== 11}
                className="rounded-sm px-0.5 py-0.5 text-meta font-semibold text-ink transition-colors hover:text-brand-600 disabled:cursor-not-allowed disabled:font-medium disabled:text-muted"
              >
                {cooldown > 0 ? `${cooldown}s 后重发` : sending ? "发送中..." : "获取验证码"}
              </button>
            </div>
            <SmsOtpInput
              value={otp}
              onChange={(nextOtp) => {
                setOtp(nextOtp);
                setError("");
              }}
              focusSignal={focusSignal}
              labelledBy="login-otp-label"
            />
            <p className="text-meta text-muted">未注册的手机号验证后会直接创建账号。</p>
          </div>
        ) : (
          <div>
            {/* 标签行：左标签 + 右忘记密码（原型 01 field-label 布局） */}
            <div className="flex items-baseline justify-between">
              <label className="block text-copy font-medium text-ink">密码</label>
              <Link
                href="/forgot-password"
                className="text-meta text-brand-500 hover:underline font-medium"
              >
                忘记密码？
              </Link>
            </div>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5"
              placeholder="请输入密码"
            />
          </div>
        )}

        {(error || smsError) && <p className="text-copy text-error">{error || smsError}</p>}

        <Button type="submit" fullWidth disabled={loading} className="mt-2">
          {loading ? "登录中..." : "登录"}
        </Button>
      </form>

      {/* 次要入口 + 底部信任行（原型 01 foot） */}
      <p className="mt-5 text-center text-copy text-muted">
        还没有账号？{" "}
        <Link
          href={next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`}
          className="font-semibold text-ink hover:text-brand-600 transition-colors"
        >
          创建账号
        </Link>
      </p>
      <div className="mt-8 flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-caption text-muted-soft">
          <Lock size={11} />
          数据加密存储 · 不向第三方共享
        </span>
        <span className="text-caption text-muted-soft">
          <Link href="/terms" className="text-muted hover:text-ink transition-colors">
            服务条款
          </Link>
          <span className="mx-2 opacity-50">·</span>
          <Link href="/privacy" className="text-muted hover:text-ink transition-colors">
            隐私政策
          </Link>
          <span className="mx-2 opacity-50">·</span>
          <Link href="/contact" className="text-muted hover:text-ink transition-colors">
            联系我们
          </Link>
        </span>
      </div>
    </AuthCard>
  );
}
