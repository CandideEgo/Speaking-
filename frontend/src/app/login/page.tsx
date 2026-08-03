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
import { Lock } from "lucide-react";

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
      const res = await api<{ token: string; refresh_token: string }>("/api/v1/auth/phone-login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
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
    <AuthCard title="欢迎回来" subtitle="登录账号，继续今天的学习。">
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink">手机号</label>
          {/* +86 前缀（原型 01）：整组 focus 态由 Input 自身承担 */}
          <div className="mt-1.5 flex items-stretch">
            <span className="inline-flex items-center px-3.5 text-sm font-medium text-body bg-surface-card border border-r-0 border-hairline rounded-l-md select-none">
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
        <div>
          {/* 标签行：左标签 + 右忘记密码（原型 01 field-label 布局） */}
          <div className="flex items-baseline justify-between">
            <label className="block text-sm font-medium text-ink">密码</label>
            <Link
              href="/forgot-password"
              className="text-xs text-brand-500 hover:underline font-medium"
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

        {error && <p className="text-sm text-error">{error}</p>}

        <Button type="submit" fullWidth disabled={loading} className="mt-2">
          {loading ? "登录中..." : "登录"}
        </Button>
      </form>

      {/* 次要入口 + 底部信任行（原型 01 foot） */}
      <p className="mt-5 text-center text-[13px] text-muted">
        还没有账号？{" "}
        <Link
          href="/register"
          className="font-semibold text-ink hover:text-brand-600 transition-colors"
        >
          创建账号
        </Link>
      </p>
      <div className="mt-8 flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-soft">
          <Lock size={11} />
          数据加密存储 · 不向第三方共享
        </span>
        <span className="text-[11px] text-muted-soft">
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
