"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api<{ message: string }>("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-coral text-white">
            <Sparkles size={22} />
          </span>
          <h1 className="mt-4 font-display text-3xl font-normal text-ink tracking-display-md">
            重置密码
          </h1>
          {sent ? (
            <p className="mt-2 text-sm text-muted-foreground">
              重置链接已发送到您的邮箱
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              输入您的邮箱，我们将发送重置链接
            </p>
          )}
        </div>

        {sent ? (
          <div className="mt-8 text-center space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-sm text-green-800">
                如果该邮箱已注册，您将收到一封包含重置链接的邮件。请检查收件箱和垃圾邮件。
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-coral hover:underline font-medium"
            >
              <ArrowLeft size={14} />
              返回登录
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center mt-2"
            >
              {loading ? "发送中..." : "发送重置链接"}
            </button>

            <div className="text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm text-coral hover:underline font-medium"
              >
                <ArrowLeft size={14} />
                返回登录
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
