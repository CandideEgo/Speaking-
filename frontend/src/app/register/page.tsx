"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/api";
import { Sparkles } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ token: string; user: { id: string; email: string } }>(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: JSON.stringify({ email, password, name: name || null }),
        }
      );
      setToken(res.token);
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
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-coral text-white">
            <Sparkles size={22} />
          </span>
          <h1 className="mt-4 font-display text-3xl font-normal text-ink tracking-display-md">
            创建账号
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            已有账号？{" "}
            <Link href="/login" className="text-coral hover:underline font-medium">
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
              minLength={6}
              className="input-field mt-1.5"
              placeholder="至少 6 位"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center mt-2"
          >
            {loading ? "注册中..." : "注册"}
          </button>
        </form>
      </div>
    </main>
  );
}