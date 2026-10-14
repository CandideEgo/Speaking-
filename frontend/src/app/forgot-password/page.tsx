"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { PASSWORD_RE, PASSWORD_RULE_MESSAGE } from "@/lib/password";
import { PHONE_RE } from "@/lib/smsCode";
import { useSmsCode } from "@/hooks/useSmsCode";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCard } from "@/components/auth/AuthCard";
import { SmsOtpInput } from "@/components/auth/SmsOtpInput";
import { cn } from "@/lib/utils";

/** Mask a phone number: 138****8855（原型 15）. */
function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

// 生产短信验证码为 4 位（开发/CI 假码 1234）；后端兼容 4–6 位。
const OTP_LENGTH = 4;

const STEPS = [
  { title: "找回密码", sub: "输入注册时的手机号，我们将发送验证码" },
  { title: "输入验证码", sub: "" }, // 副标题动态展示手机号
  { title: "设置新密码", sub: "验证成功，请设置新的登录密码" },
];

/**
 * 找回密码（原型 15 三步向导）：手机号 → 验证码 → 新密码。
 * 验证码的真正校验发生在后端 reset-password 调用（一次性消费）；
 * 若服务端判定验证码错误，回退到第二步并允许重发。
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const { cooldown, sending, sendCode, error: smsError } = useSmsCode(phone);

  const code = otp.join("");

  async function handleSendCode() {
    setError("");
    if (!PHONE_RE.test(phone)) {
      setError("请输入有效的手机号");
      return;
    }
    const ok = await sendCode("reset_password");
    if (ok) {
      setStep(1);
      setFocusSignal((n) => n + 1);
    }
  }

  /** 第二步的重发：与第一步同一套行为（清旧错误、成功后把焦点送回第一格）。 */
  async function handleResend() {
    setError("");
    if (await sendCode("reset_password")) setFocusSignal((n) => n + 1);
  }

  function handleVerifyCode() {
    setError("");
    // 4 位起放行；真实有效性由后端在重置时校验（一次性消费）。
    if (code.trim().length < OTP_LENGTH) {
      setError("请输入验证码");
      return;
    }
    setStep(2);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();

    // 回车提交不受按钮 disabled 约束，所以在途要在这里再挡一次。
    if (loading) return;
    setError("");

    if (!PASSWORD_RE.test(password)) {
      setError(PASSWORD_RULE_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      await api<{ message: string }>("/api/v1/auth/sms/reset-password", {
        method: "POST",
        body: JSON.stringify({ phone, code, new_password: password }),
      });
      setDone(true);
    } catch (err) {
      // 验证码错误/失效 -> 回到第二步重新输入或重发。
      // 该端点返回 400 只可能是验证码无效（密码强度失败是 422），故按状态码判断。
      if (err instanceof ApiError && err.status === 400) {
        setStep(1);
        setOtp(Array(OTP_LENGTH).fill("")); // 旧码已被判失效，别让它留在格子里
        setError("验证码错误或已失效，请重新输入");
      } else {
        // 429 / 500 / 断网：toast 之外还要在表单里留痕，否则页面看起来「什么都没发生」。
        setError(err instanceof Error ? err.message : "重置失败，请重试");
        toastApiError(err, "重置失败，请重试");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title={done ? "重置成功" : STEPS[step].title}
      subtitle={
        done ? (
          "请用新密码登录"
        ) : step === 1 ? (
          <>
            验证码已发送至 <strong className="text-ink">{maskPhone(phone)}</strong>，5 分钟内有效
          </>
        ) : (
          STEPS[step].sub
        )
      }
    >
      {/* 步骤指示器（原型 15 step-ind） */}
      {!done && (
        <div className="mt-2 flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-brand-500" : "bg-surface-card"
              )}
            />
          ))}
        </div>
      )}

      {done ? (
        <div className="mt-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-success-soft border border-success/30 flex items-center justify-center">
            <Check size={22} className="text-success" />
          </div>
          <div className="rounded-lg bg-success-soft border border-success/30 p-4">
            <p className="text-copy text-success">
              如果该手机号已注册，密码已重置。请用新密码登录。
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-copy text-brand-500 hover:underline font-medium"
          >
            <ArrowLeft size={14} />
            返回登录
          </Link>
        </div>
      ) : (
        <>
          {/* Step 1: 手机号 */}
          {step === 0 && (
            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="reset-phone" className="block text-copy font-medium text-ink">
                  手机号
                </label>
                <Input
                  id="reset-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={11}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 11));
                    setError("");
                  }}
                  required
                  className="mt-1.5"
                  placeholder="请输入手机号"
                />
              </div>
              {(error || smsError) && (
                <p role="alert" className="text-copy text-error">
                  {error || smsError}
                </p>
              )}
              <Button
                fullWidth
                disabled={sending || !PHONE_RE.test(phone)}
                onClick={handleSendCode}
              >
                {sending ? "发送中..." : cooldown > 0 ? `${cooldown}s 后可重发` : "发送验证码"}
              </Button>
            </div>
          )}

          {/* Step 2: 验证码 */}
          {step === 1 && (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span id="reset-otp-label" className="text-copy font-medium text-ink">
                    验证码
                  </span>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={sending || cooldown > 0}
                    className="rounded-sm px-0.5 py-0.5 text-meta font-semibold text-ink transition-colors hover:text-brand-600 disabled:cursor-not-allowed disabled:font-medium disabled:text-muted"
                  >
                    {cooldown > 0 ? `${cooldown}s 后重发` : sending ? "发送中..." : "重新发送"}
                  </button>
                </div>
                <SmsOtpInput
                  value={otp}
                  onChange={(nextOtp) => {
                    setOtp(nextOtp);
                    setError("");
                  }}
                  hasError={Boolean(error)}
                  autoFocus
                  focusSignal={focusSignal}
                  labelledBy="reset-otp-label"
                />
              </div>
              {(error || smsError) && (
                <p role="alert" className="text-copy text-error">
                  {error || smsError}
                </p>
              )}
              <Button fullWidth onClick={handleVerifyCode}>
                验证
              </Button>
            </div>
          )}

          {/* Step 3: 新密码 */}
          {step === 2 && (
            <form onSubmit={handleReset} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="reset-password" className="block text-copy font-medium text-ink">
                  新密码
                </label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  disabled={loading}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  required
                  minLength={8}
                  className="mt-1.5"
                  placeholder="至少 8 位，含大小写字母和数字"
                />
              </div>
              <div>
                <label
                  htmlFor="reset-password-confirm"
                  className="block text-copy font-medium text-ink"
                >
                  确认新密码
                </label>
                <Input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  disabled={loading}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError("");
                  }}
                  required
                  minLength={8}
                  className="mt-1.5"
                  placeholder="再次输入新密码"
                />
              </div>

              {error && (
                <p role="alert" className="text-copy text-error">
                  {error}
                </p>
              )}

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? "重置中..." : "完成修改"}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            {/* 上一步：第一步没有上一步，那个 invisible 的死按钮不再渲染 */}
            {step > 0 && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep(step - 1);
                }}
                className="inline-flex items-center gap-1.5 text-copy text-muted hover:text-ink font-medium transition-colors"
              >
                <ArrowLeft size={14} />
                上一步
              </button>
            )}
            {step === 0 && (
              <div>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-copy text-brand-500 hover:underline font-medium"
                >
                  <ArrowLeft size={14} />
                  返回登录
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </AuthCard>
  );
}
