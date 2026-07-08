"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/stores/authStore";
import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AuthCard } from "@/components/auth/AuthCard";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Show spinner while auth state is initializing
  if (isLoading) {
    return <FullPageSpinner />;
  }

  // Don't show login form if already authenticated
  if (isAuthenticated) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ token: string; refresh_token: string }>(
        "/api/v1/auth/phone-login",
        {
          method: "POST",
          body: JSON.stringify({ phone, password }),
        },
      );
      login(res.token, res.refresh_token);
      router.push("/");
    } catch (err) {
      setError(apiErrorMessage(err, "登录失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="欢迎回来"
      subtitle={
        <>
          还没有账号？{" "}
          <Link
            href="/register"
            className="text-brand-500 hover:underline font-medium"
          >
            注册
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
          <label className="block text-sm font-medium text-ink">密码</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1.5"
          />
          <div className="mt-1.5 text-right">
            <Link
              href="/forgot-password"
              className="text-xs text-brand-500 hover:underline font-medium"
            >
              忘记密码?
            </Link>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" fullWidth disabled={loading} className="mt-2">
          {loading ? "登录中..." : "登录"}
        </Button>
      </form>
    </AuthCard>
  );
}
