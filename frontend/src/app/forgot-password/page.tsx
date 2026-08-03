"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { useSmsCode } from "@/hooks/useSmsCode";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCard } from "@/components/auth/AuthCard";
import { cn } from "@/lib/utils";

/** Mask a phone number: 138****8855（原型 15）. */
function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

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
  const { cooldown, sending, sendCode, error: smsError } = useSmsCode();
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSendCode() {
    setError("");
    if (!/^1\d{10}$/.test(phone)) {
      setError("请输入有效的手机号");
      return;
    }
    const ok = await sendCode(phone, "reset_password");
    if (ok) setStep(1);
  }

  function handleVerifyCode() {
    setError("");
    // 开发环境验证码为 4 位（1234），线上为 6 位 —— 4 位起放行，
    // 真实有效性由后端在重置时校验。
    if (code.trim().length < 4) {
      setError("请输入验证码");
      return;
    }
    setStep(2);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      setError("密码至少 8 位，需含大小写字母和数字");
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
      const msg = err instanceof Error ? err.message : "";
      // 验证码错误/失效 -> 回到第二步重新输入或重发
      if (msg.includes("验证码")) {
        setStep(1);
        setError("验证码错误或已失效，请重新输入");
      } else {
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
        <div className="mt-6 flex gap-1.5">
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
            <p className="text-sm text-success">如果该手机号已注册，密码已重置。请用新密码登录。</p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:underline font-medium"
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
                <label className="block text-sm font-medium text-ink">手机号</label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  required
                  className="mt-1.5"
                  placeholder="请输入手机号"
                />
              </div>
              {(error || smsError) && <p className="text-sm text-error">{error || smsError}</p>}
              <Button fullWidth disabled={sending || phone.length !== 11} onClick={handleSendCode}>
                {sending ? "发送中..." : cooldown > 0 ? `${cooldown}s 后可重发` : "发送验证码"}
              </Button>
            </div>
          )}

          {/* Step 2: 验证码 */}
          {step === 1 && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink">验证码</label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                    placeholder="请输入验证码"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sending || cooldown > 0}
                    onClick={() => sendCode(phone, "reset_password")}
                    className="shrink-0"
                  >
                    {cooldown > 0 ? `${cooldown}s 后重发` : sending ? "发送中..." : "重新发送"}
                  </Button>
                </div>
              </div>
              {(error || smsError) && <p className="text-sm text-error">{error || smsError}</p>}
              <Button fullWidth onClick={handleVerifyCode}>
                验证
              </Button>
            </div>
          )}

          {/* Step 3: 新密码 */}
          {step === 2 && (
            <form onSubmit={handleReset} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink">新密码</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="mt-1.5"
                  placeholder="至少 8 位，含大小写字母和数字"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink">确认新密码</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="mt-1.5"
                  placeholder="再次输入新密码"
                />
              </div>

              {error && <p className="text-sm text-error">{error}</p>}

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? "重置中..." : "完成修改"}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setError("");
                if (step === 0) return;
                setStep(step - 1);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink font-medium transition-colors",
                step === 0 && "invisible"
              )}
            >
              <ArrowLeft size={14} />
              {step === 0 ? "返回登录" : "上一步"}
            </button>
            {step === 0 && (
              <div className="mt-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:underline font-medium"
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
