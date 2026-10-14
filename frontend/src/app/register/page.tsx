"use client";

import { Suspense, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { postAuthRedirect, safeNext } from "@/lib/authHelpers";
import { PHONE_RE } from "@/lib/smsCode";
import { useAuthStore } from "@/stores/authStore";
import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";
import { useSmsCode } from "@/hooks/useSmsCode";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthenticatedRedirect } from "@/components/auth/AuthenticatedRedirect";
import { SmsOtpInput } from "@/components/auth/SmsOtpInput";
import { cn } from "@/lib/utils";

// 生产短信验证码为 4 位（开发/CI 假码 1234 同为 4 位）；后端仍兼容 4–6 位。
const OTP_LENGTH = 4;

// ?next= 透传（登录页跳注册时携带），注册成功后跳回原页。
// 免密注册 = 验证码即登录：新手机号由 /auth/sms/login 建号，再进入「设置登录密码」
// 步骤（可跳过），设置后可用手机号 + 密码登录。
export default function RegisterPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const login = useAuthStore((s) => s.login);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; code?: string }>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  // 登录后去哪：提交前声明，之后由 useRedirectIfAuthenticated 导航（见 handleSubmit）。
  const [postAuth, setPostAuth] = useState<string | null>(null);

  const { cooldown, sending, sendCode, error: smsError } = useSmsCode(phone);
  const { isAuthenticated, isLoading, redirectStuck } = useRedirectIfAuthenticated(
    postAuth ?? next
  );

  const code = otp.join("");
  const phoneValid = PHONE_RE.test(phone);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isAuthenticated) {
    return <AuthenticatedRedirect redirectStuck={redirectStuck} next={postAuth ?? next} />;
  }

  function handleOtpChange(nextOtp: string[]) {
    setOtp(nextOtp);
    setFieldErrors((current) => ({ ...current, code: "" }));
    setFormError("");
  }

  function handlePhoneChange(event: ChangeEvent<HTMLInputElement>) {
    const nextPhone = event.target.value.replace(/\D/g, "").slice(0, 11);
    setPhone(nextPhone);
    setFieldErrors({});
    setFormError("");
    if (sentTo && sentTo !== nextPhone) {
      setSentTo(null);
      setOtp(Array(OTP_LENGTH).fill(""));
    }
  }

  async function handleSendCode() {
    setFormError("");
    if (!phoneValid) {
      setFieldErrors((current) => ({ ...current, phone: "请输入正确的手机号" }));
      return;
    }
    const sent = await sendCode("auth");
    if (sent) {
      setSentTo(phone);
      setFieldErrors((current) => ({ ...current, code: "" }));
      setFocusSignal((n) => n + 1);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // 回车提交不受按钮 disabled 约束，所以在途要在这里再挡一次。
    if (loading) return;

    const nextErrors: { phone?: string; code?: string } = {};
    if (!phoneValid) nextErrors.phone = "请输入正确的手机号";
    if (code.length < OTP_LENGTH) nextErrors.code = "请输入完整的验证码";
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;
    if (!agreed) {
      setFormError("请先阅读并同意《用户协议》与《隐私政策》");
      return;
    }

    setFormError("");
    setLoading(true);
    try {
      const res = await api<{
        token: string;
        refresh_token: string;
        is_new_user: boolean;
        user: { id: string; phone: string; onboarding_completed: boolean };
      }>("/api/v1/auth/sms/login", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      // 先声明登录后去哪，再登录。登录后**唯一的导航者**是上面的
      // useRedirectIfAuthenticated：它会在 isAuthenticated 翻真的那次 effect 里跳到
      // postAuth。这里若再自己 router.replace 一次，会被它覆盖 —— Next 的 action
      // queue 会把先发的导航标为 discarded，后发的赢（注册完落首页即由此而来）。
      setPostAuth(postAuthRedirect(res, next, "register"));
      login(res.token, res.refresh_token);
    } catch (err) {
      setFormError(apiErrorMessage(err, "注册失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="创建账号"
      subtitle={
        <>
          已有账号？{" "}
          <Link
            href={loginHref}
            className="font-semibold text-ink underline decoration-hairline underline-offset-2 transition-colors hover:decoration-ink"
          >
            直接登录
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="register-phone" className="text-meta font-medium text-ink">
            手机号
          </label>
          <div
            className={cn(
              "flex h-[46px] overflow-hidden rounded-md border-[1.5px] bg-surface-card transition-colors focus-within:border-brand-500 focus-within:bg-canvas focus-within:ring-4 focus-within:ring-brand-500/15",
              fieldErrors.phone ? "border-error" : "border-hairline hover:border-muted"
            )}
          >
            <span className="flex select-none items-center border-r border-hairline bg-surface-soft px-3.5 text-copy font-medium text-ink">
              +86
            </span>
            <input
              id="register-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              disabled={loading}
              value={phone}
              onChange={handlePhoneChange}
              placeholder="请输入手机号"
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? "register-phone-error" : undefined}
              className="min-w-0 flex-1 bg-transparent px-3.5 font-mono text-copy-lg tracking-[0.05em] text-ink outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-soft"
            />
            {phoneValid && (
              <span className="flex items-center pr-3.5 text-success" aria-hidden="true">
                <Check size={18} strokeWidth={2.2} />
              </span>
            )}
          </div>
          {fieldErrors.phone && (
            <p
              id="register-phone-error"
              role="alert"
              className="text-meta leading-relaxed text-error"
            >
              {fieldErrors.phone}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span id="register-otp-label" className="text-meta font-medium text-ink">
              验证码
            </span>
            <button
              type="button"
              onClick={handleSendCode}
              disabled={!phoneValid || sending || loading || cooldown > 0}
              className="rounded-sm px-0.5 py-0.5 text-meta font-semibold text-ink transition-colors hover:text-brand-600 disabled:cursor-not-allowed disabled:font-medium disabled:text-muted"
            >
              {cooldown > 0
                ? `${cooldown}s 后重发`
                : sending
                  ? "发送中..."
                  : sentTo
                    ? "重新发送"
                    : "获取验证码"}
            </button>
          </div>

          {/* 发码失败的错误属于「这次发送」，不属于手机号字段 */}
          {smsError && (
            <p role="alert" className="text-meta leading-relaxed text-error">
              {smsError}
            </p>
          )}

          <SmsOtpInput
            value={otp}
            onChange={handleOtpChange}
            disabled={loading}
            hasError={Boolean(fieldErrors.code)}
            focusSignal={focusSignal}
            labelledBy="register-otp-label"
            describedBy={fieldErrors.code ? "register-code-error" : undefined}
          />

          {fieldErrors.code && (
            <p
              id="register-code-error"
              role="alert"
              className="text-meta leading-relaxed text-error"
            >
              {fieldErrors.code}
            </p>
          )}
          {sentTo === phone && !fieldErrors.code && (
            <p
              className="flex items-center gap-1.5 text-meta leading-relaxed text-success"
              role="status"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              验证码已发送，5 分钟内有效
            </p>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-sm border border-error/20 bg-red-soft px-3 py-2.5 text-meta leading-relaxed text-error"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        <label className="flex cursor-pointer select-none items-start gap-2.5 py-px">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => {
              setAgreed(event.target.checked);
              if (event.target.checked) setFormError("");
            }}
            className="peer sr-only"
          />
          <span
            className={cn(
              "mt-px grid h-[18px] w-[18px] flex-none place-items-center rounded-sm border-[1.5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2",
              agreed ? "border-brand-500 bg-brand-500" : "border-hairline bg-canvas"
            )}
            aria-hidden="true"
          >
            <Check
              size={11}
              strokeWidth={3.2}
              className={cn(
                "text-on-primary transition-all",
                agreed ? "scale-100 opacity-100" : "scale-75 opacity-0"
              )}
            />
          </span>
          <span className="text-meta leading-relaxed text-muted">
            我已阅读并同意
            <Link
              href="/terms"
              className="font-medium text-ink underline decoration-ink/30 underline-offset-2 transition-colors hover:decoration-ink"
              target="_blank"
            >
              《用户协议》
            </Link>
            与
            <Link
              href="/privacy"
              className="font-medium text-ink underline decoration-ink/30 underline-offset-2 transition-colors hover:decoration-ink"
              target="_blank"
            >
              《隐私政策》
            </Link>
          </span>
        </label>

        {/* 未勾选时提交按钮是 disabled 的（e2e 钉住了这个契约），所以得写出「为什么点不动」 */}
        {!agreed && phoneValid && code.length === OTP_LENGTH && (
          <p className="text-meta leading-relaxed text-muted">勾选上方协议后即可注册</p>
        )}

        <Button
          type="submit"
          fullWidth
          disabled={loading || !agreed}
          className="mt-1 h-12 rounded-md text-copy-lg"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              注册中...
            </>
          ) : (
            "注册并继续"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
