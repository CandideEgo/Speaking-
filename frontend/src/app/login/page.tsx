"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { postAuthRedirect, safeNext } from "@/lib/authHelpers";
import { PHONE_RE } from "@/lib/smsCode";
import { useAuthStore } from "@/stores/authStore";
import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";
import { useSmsCode } from "@/hooks/useSmsCode";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthenticatedRedirect } from "@/components/auth/AuthenticatedRedirect";
import { SmsOtpInput } from "@/components/auth/SmsOtpInput";
import { PasswordField } from "@/components/auth/PasswordField";
import { cn } from "@/lib/utils";

type LoginMode = "code" | "password";

// 生产短信验证码为 4 位；后端兼容 4–6 位。
const OTP_LENGTH = 4;

const TABS = [
  { value: "code", label: "验证码登录" },
  { value: "password", label: "密码登录" },
] as const;

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
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const login = useAuthStore((s) => s.login);

  const [mode, setMode] = useState<LoginMode>("code");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; code?: string }>({});
  const [loading, setLoading] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  // 登录后去哪：提交前声明，之后由 useRedirectIfAuthenticated 导航（见 handleSubmit）。
  const [postAuth, setPostAuth] = useState<string | null>(null);
  const tabRefs = useRef<Record<LoginMode, HTMLButtonElement | null>>({
    code: null,
    password: null,
  });

  const { cooldown, sending, sendCode, error: smsError, clearError } = useSmsCode(phone);
  const { isAuthenticated, isLoading, redirectStuck } = useRedirectIfAuthenticated(
    postAuth ?? next
  );

  const code = otp.join("");

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isAuthenticated) {
    return <AuthenticatedRedirect redirectStuck={redirectStuck} next={postAuth ?? next} />;
  }

  function switchMode(nextMode: LoginMode, moveFocus = false) {
    setMode(nextMode);
    setError("");
    setFieldErrors({});
    clearError();
    if (moveFocus) {
      // 键盘切换：焦点进入面板第一个可输入控件（设计 initTabs 的行为）。
      requestAnimationFrame(() => {
        const panel = document.getElementById(`panel-${nextMode}`);
        const first = panel?.querySelector<HTMLElement>("input:not([disabled])");
        first?.focus();
      });
    }
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((tab) => tab.value === mode);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextMode = TABS[nextIndex].value;
    switchMode(nextMode);
    tabRefs.current[nextMode]?.focus();
  }

  function handlePhoneChange(value: string) {
    setPhone(value.replace(/\D/g, "").slice(0, 11));
    setFieldErrors((current) => ({ ...current, phone: undefined }));
    setError("");
  }

  async function handleSendCode() {
    setError("");
    setFieldErrors({});
    if (!PHONE_RE.test(phone)) {
      setFieldErrors({ phone: "请输入正确的手机号" });
      return;
    }
    const sent = await sendCode("auth");
    if (sent) setFocusSignal((n) => n + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 回车提交不受按钮 disabled 约束，所以在途要在这里再挡一次。
    if (loading) return;

    setError("");
    const nextErrors: { phone?: string; code?: string } = {};
    if (!PHONE_RE.test(phone)) nextErrors.phone = "请输入正确的手机号";
    // 表单标了 noValidate（不让浏览器原生气泡抢先，否则下面的中文文案永不执行），
    // 所以空验证码/空密码要在这里挡，不能直接打到后端换回一段英文的 422。
    if (mode === "code" && code.length < OTP_LENGTH) nextErrors.code = "请输入完整的验证码";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (mode === "password" && !password) {
      setError("请输入密码");
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
        // 先声明登录后去哪，再登录：登录后**唯一的导航者**是上面的
        // useRedirectIfAuthenticated（见 register/page.tsx 的同款注释）。
        setPostAuth(postAuthRedirect(res, next, "login"));
        login(res.token, res.refresh_token);
      } else {
        const res = await api<{ token: string; refresh_token: string }>(
          "/api/v1/auth/phone-login",
          {
            method: "POST",
            body: JSON.stringify({ phone, password }),
          }
        );
        // 密码登录的目标就是 next —— 守卫的默认目标即是它，不必再声明一次。
        login(res.token, res.refresh_token);
      }
    } catch (err) {
      setError(apiErrorMessage(err, "登录失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  const serverError = error || smsError;

  return (
    <AuthCard title="欢迎回来" subtitle="登录账号，继续今天的学习。">
      <div
        role="tablist"
        aria-label="登录方式"
        className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-hairline bg-surface-soft p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            ref={(node) => {
              tabRefs.current[tab.value] = node;
            }}
            id={`tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={mode === tab.value}
            aria-controls={`panel-${tab.value}`}
            tabIndex={mode === tab.value ? 0 : -1}
            onClick={() => switchMode(tab.value)}
            onKeyDown={handleTabKeyDown}
            className={cn(
              "rounded-sm px-3 py-2 text-copy font-medium transition-colors",
              mode === tab.value
                ? "border border-hairline bg-canvas font-semibold text-ink"
                : "border border-transparent text-body hover:text-ink"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {mode === "code" ? (
          <div
            id="panel-code"
            role="tabpanel"
            aria-labelledby="tab-code"
            tabIndex={0}
            className="space-y-4 outline-none"
          >
            <div>
              <label htmlFor="login-phone" className="block text-copy font-medium text-ink">
                手机号
              </label>
              <div className="mt-1.5 flex h-[46px] items-stretch">
                <span className="inline-flex select-none items-center rounded-l-md border border-r-0 border-hairline bg-surface-soft px-3.5 text-copy font-medium text-body">
                  +86
                </span>
                <Input
                  id="login-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={11}
                  disabled={loading}
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? "login-phone-error" : "login-phone-hint"}
                  required
                  className={cn("mt-0 flex-1 rounded-l-none", fieldErrors.phone && "border-error")}
                  placeholder="请输入手机号"
                />
              </div>
              {fieldErrors.phone ? (
                <p
                  id="login-phone-error"
                  role="alert"
                  className="mt-1.5 text-meta leading-relaxed text-error-text"
                >
                  {fieldErrors.phone}
                </p>
              ) : (
                <p id="login-phone-hint" className="mt-1.5 text-caption text-muted">
                  中国大陆手机号，11 位。
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span id="login-otp-label" className="text-copy font-medium text-ink">
                  验证码
                </span>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={!PHONE_RE.test(phone) || sending || loading || cooldown > 0}
                  className="rounded-sm px-0.5 py-0.5 text-meta font-semibold text-ink transition-colors hover:text-brand-700 disabled:cursor-not-allowed disabled:font-medium disabled:text-muted"
                >
                  {cooldown > 0 ? `${cooldown}s 后重发` : sending ? "发送中..." : "获取验证码"}
                </button>
              </div>
              <SmsOtpInput
                value={otp}
                onChange={(nextOtp) => {
                  setOtp(nextOtp);
                  setFieldErrors((current) => ({ ...current, code: undefined }));
                  setError("");
                }}
                disabled={loading}
                hasError={Boolean(fieldErrors.code) || (Boolean(error) && mode === "code")}
                focusSignal={focusSignal}
                labelledBy="login-otp-label"
                describedBy={fieldErrors.code ? "login-code-error" : undefined}
              />
              {fieldErrors.code && (
                <p
                  id="login-code-error"
                  role="alert"
                  className="text-meta leading-relaxed text-error-text"
                >
                  {fieldErrors.code}
                </p>
              )}
              <p className="text-meta text-muted">未注册的手机号验证后会直接创建账号。</p>
            </div>
          </div>
        ) : (
          <div
            id="panel-password"
            role="tabpanel"
            aria-labelledby="tab-password"
            tabIndex={0}
            className="space-y-4 outline-none"
          >
            <div>
              <label htmlFor="login-phone-2" className="block text-copy font-medium text-ink">
                手机号
              </label>
              <div className="mt-1.5 flex h-[46px] items-stretch">
                <span className="inline-flex select-none items-center rounded-l-md border border-r-0 border-hairline bg-surface-soft px-3.5 text-copy font-medium text-body">
                  +86
                </span>
                <Input
                  id="login-phone-2"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={11}
                  disabled={loading}
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? "login-phone-2-error" : undefined}
                  required
                  className={cn("mt-0 flex-1 rounded-l-none", fieldErrors.phone && "border-error")}
                  placeholder="请输入手机号"
                />
              </div>
              {fieldErrors.phone && (
                <p
                  id="login-phone-2-error"
                  role="alert"
                  className="mt-1.5 text-meta leading-relaxed text-error-text"
                >
                  {fieldErrors.phone}
                </p>
              )}
            </div>

            <PasswordField
              id="login-password"
              label="密码"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError("");
              }}
              labelRight={
                <Link
                  href="/forgot-password"
                  className="text-meta font-medium text-brand-700 hover:underline"
                >
                  忘记密码？
                </Link>
              }
              autoComplete="current-password"
              placeholder="请输入密码"
              disabled={loading}
              hint="密码登录只在已经设置过密码的账号上可用；没设过就用验证码登录，然后在「设置登录密码」里补上。"
            />
          </div>
        )}

        {serverError && (
          <div className="flex items-start gap-2 rounded-md border border-error/30 bg-red-soft px-3 py-2.5 [&>p]:text-error-text">
            <AlertCircle
              size={16}
              className="mt-0.5 flex-none text-error-text"
              aria-hidden="true"
            />
            {/* e2e（auth.spec.ts）钉住了 p.text-error 的文案，保留该选择器。 */}
            <p
              id="login-error"
              role="alert"
              className="min-w-0 text-meta leading-relaxed text-error"
            >
              {serverError}
            </p>
          </div>
        )}

        <Button type="submit" fullWidth loading={loading} className="mt-2 h-12">
          {loading ? "登录中..." : "登录"}
        </Button>
      </form>

      {/* 次要入口 + 底部信任行 */}
      <p className="mt-5 text-center text-copy text-muted">
        还没有账号？{" "}
        <Link
          href={next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`}
          className="font-semibold text-ink transition-colors hover:text-brand-700"
        >
          创建账号
        </Link>
      </p>
      <div className="mt-8 flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-caption text-muted">
          <Lock size={11} aria-hidden="true" />
          妥善保护你的账号与学习记录
        </span>
        <span className="text-caption text-muted">
          <Link href="/terms" className="text-muted transition-colors hover:text-ink">
            服务条款
          </Link>
          <span className="mx-2 opacity-50">·</span>
          <Link href="/privacy" className="text-muted transition-colors hover:text-ink">
            隐私政策
          </Link>
          <span className="mx-2 opacity-50">·</span>
          <Link href="/contact" className="text-muted transition-colors hover:text-ink">
            联系我们
          </Link>
        </span>
      </div>
    </AuthCard>
  );
}
