"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/stores/authStore";
import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";
import { useSmsCode } from "@/hooks/useSmsCode";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AuthCard } from "@/components/auth/AuthCard";

export default function RegisterPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();
  const { cooldown, sending, sendCode, error: smsError } = useSmsCode();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Show spinner while auth state is initializing
  if (isLoading) {
    return <FullPageSpinner />;
  }

  // Don't show register form if already authenticated
  if (isAuthenticated) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("请先阅读并同意《用户协议》与《隐私政策》");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await api<{
        token: string;
        refresh_token: string;
        user: { id: string; phone: string };
      }>("/api/v1/auth/sms/register", {
        method: "POST",
        body: JSON.stringify({ phone, code, password }),
      });
      login(res.token, res.refresh_token);
      router.push("/");
    } catch (err) {
      setError(apiErrorMessage(err, "注册失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="创建账号"
      subtitle={
        <>
          已有账号？{" "}
          <Link
            href="/login"
            className="text-brand-500 hover:underline font-medium"
          >
            登录
          </Link>
        </>
      }
    >
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
          <label className="block text-sm font-medium text-ink">设置密码</label>
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

        {(error || smsError) && (
          <p className="text-sm text-red-600">{error || smsError}</p>
        )}

        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-hairline text-brand-500 focus:ring-brand-500"
          />
          <span>
            我已阅读并同意
            <Link
              href="/terms"
              className="text-brand-500 hover:underline"
              target="_blank"
            >
              《用户协议》
            </Link>
            与
            <Link
              href="/privacy"
              className="text-brand-500 hover:underline"
              target="_blank"
            >
              《隐私政策》
            </Link>
          </span>
        </label>

        <Button
          type="submit"
          fullWidth
          disabled={loading || !agreed}
          className="mt-2"
        >
          {loading ? "注册中..." : "注册"}
        </Button>
      </form>
    </AuthCard>
  );
}
