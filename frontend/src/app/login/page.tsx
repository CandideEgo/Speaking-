"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/stores/authStore";
import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TabPills } from "@/components/ui/TabPills";
import { FullPageSpinner } from "@/components/common/Spinner";

type Mode = "email" | "phone";

const CODE_COOLDOWN = 60;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const { isAuthenticated, isLoading } = useRedirectIfAuthenticated();
  const [mode, setMode] = useState<Mode>("email");

  // Email form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Phone form
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Countdown timer for the send-code button.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Switching tabs clears any error.

  // Show spinner while auth state is initializing
  if (isLoading) {
    return <FullPageSpinner />;
  }

  // Don't show login form if already authenticated
  if (isAuthenticated) {
    return null;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ token: string; refresh_token: string }>(
        "/api/v1/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
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

  async function handleSendCode() {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }
    setError("");
    setSending(true);
    try {
      await api<{ message: string }>("/api/v1/auth/sms/send-code", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setCooldown(CODE_COOLDOWN);
    } catch (err) {
      setError(apiErrorMessage(err, "验证码发送失败，请稍后再试"));
    } finally {
      setSending(false);
    }
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ token: string; refresh_token: string }>(
        "/api/v1/auth/sms/login",
        {
          method: "POST",
          body: JSON.stringify({ phone, code }),
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
    <main className="flex min-h-screen items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand-500 text-white shadow-brand">
            <Sparkles size={22} />
          </span>
          <h1 className="mt-4 font-display text-3xl font-normal text-ink tracking-display-md">
            欢迎回来
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            还没有账号？{" "}
            <Link
              href="/register"
              className="text-brand-500 hover:underline font-medium"
            >
              注册
            </Link>
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <TabPills
            activeKey={mode}
            onChange={(k) => {
              setMode(k);
              setError("");
            }}
            activeStyle="brand"
            size="sm"
            tabs={[
              { key: "email", label: "邮箱登录" },
              { key: "phone", label: "手机号登录" },
            ]}
          />
        </div>

        {mode === "email" ? (
          <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink">邮箱</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5"
                placeholder="you@example.com"
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
        ) : (
          <form onSubmit={handlePhoneSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink">
                手机号
              </label>
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
              <label className="block text-sm font-medium text-ink">
                验证码
              </label>
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
                  onClick={handleSendCode}
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

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" fullWidth disabled={loading} className="mt-2">
              {loading ? "登录中..." : "登录"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              未注册的手机号将自动创建账号
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
