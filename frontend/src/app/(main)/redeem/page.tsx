"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Sparkles, Loader2, CheckCircle2, Gift } from "lucide-react";

export default function RedeemPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api<{ success: boolean; message: string }>("/api/v1/invite-codes/redeem", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      setResult(res);
      if (res.success) setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "兑换失败" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-lg bg-coral text-white">
            <Gift size={28} />
          </div>
          <h1 className="mt-5 font-display text-3xl font-normal text-ink tracking-display-md">
            兑换 Pro 会员
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">输入购买获得的兑换码，立即升级</p>
        </div>

        {!isAuthenticated ? (
          <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm text-amber-800">
              请先
              <a href="/login" className="font-semibold underline">
                登录
              </a>
              或
              <a href="/register" className="font-semibold underline">
                注册
              </a>
              账号
            </p>
          </div>
        ) : (
          <form onSubmit={handleRedeem} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink">兑换码</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XX"
                maxLength={12}
                required
                className="input-field mt-1.5 text-center text-lg tracking-widest font-mono"
              />
            </div>

            {result && (
              <div
                className={`rounded-md p-3 text-sm ${result.success ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}
              >
                {result.success && <CheckCircle2 size={16} className="inline mr-1 -mt-0.5" />}
                {result.message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="btn-primary w-full justify-center"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? "兑换中..." : "激活 Pro"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">兑换码通过电商平台购买获得</p>
      </div>
    </main>
  );
}
