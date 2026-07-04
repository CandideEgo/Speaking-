"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { useSmsCode } from "@/hooks/useSmsCode";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCard } from "@/components/auth/AuthCard";

export default function ForgotPasswordPage() {
  const { cooldown, sending, sendCode, error: smsError } = useSmsCode();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("密码至少需要 8 位，含大小写字母、数字及特殊字符");
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
      toastApiError(err, "重置失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="重置密码"
      subtitle={done ? "密码已重置，请用新密码登录" : "用手机号验证码重置密码"}
    >
      {done ? (
        <div className="mt-8 text-center space-y-4">
          <div className="rounded-lg bg-success-soft border border-success/30 p-4">
            <p className="text-sm text-success">
              如果该手机号已注册，密码已重置。请用新密码登录。
            </p>
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
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
                disabled={sending || cooldown > 0 || phone.length !== 11}
                onClick={() => sendCode(phone)}
                className="shrink-0"
              >
                {cooldown > 0
                  ? `${cooldown}s`
                  : sending
                    ? "发送中..."
                    : "获取验证码"}
              </Button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">新密码</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1.5"
              placeholder="至少 8 位，含大小写字母、数字及特殊字符"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">
              确认密码
            </label>
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

          {(error || smsError) && (
            <p className="text-sm text-red-600">{error || smsError}</p>
          )}

          <Button type="submit" fullWidth disabled={loading} className="mt-2">
            {loading ? "重置中..." : "重置密码"}
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:underline font-medium"
            >
              <ArrowLeft size={14} />
              返回登录
            </Link>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
