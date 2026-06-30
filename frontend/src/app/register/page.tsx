"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function RegisterPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  // Show spinner while auth state is initializing
  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </main>
    );
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
        user: { id: string; email: string };
      }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name: name || null }),
      });
      login(res.token, res.refresh_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Sparkles size={22} />
          </span>
          <h1 className="mt-4 font-display text-3xl font-normal text-ink tracking-display-md">
            创建账号
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            已有账号？{" "}
            <Link
              href="/login"
              className="text-brand-500 hover:underline font-medium"
            >
              登录
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink">昵称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field mt-1.5"
              placeholder="选填"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-field mt-1.5"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="input-field mt-1.5"
              placeholder="至少 8 位，含大小写字母、数字及特殊字符"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

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
      </div>
    </main>
  );
}
