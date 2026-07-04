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

const PHONE_RE = /^1[3-9]\d{9}$/;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();
  const [identifier, setIdentifier] = useState("");
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
      // Route to the phone or email login endpoint based on the identifier.
      // A phone is all digits matching the CN mobile pattern; anything with "@"
      // (or otherwise) is treated as an email.
      const isPhone = PHONE_RE.test(identifier);
      const path = isPhone ? "/api/v1/auth/phone-login" : "/api/v1/auth/login";
      const body = isPhone
        ? { phone: identifier, password }
        : { email: identifier, password };
      const res = await api<{ token: string; refresh_token: string }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
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
          <label className="block text-sm font-medium text-ink">
            手机号或邮箱
          </label>
          <Input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            className="mt-1.5"
            placeholder="手机号或邮箱"
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
