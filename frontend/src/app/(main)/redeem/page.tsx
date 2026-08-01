"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/stores/authStore";
import { Sparkles, Loader2, CheckCircle2, Gift, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CodeInput, TOTAL_LENGTH } from "@/components/auth/CodeInput";

/** Map backend English redeem errors to friendly Chinese (ADR-0007 UX).
 *  5 错误文案状态机（原型 19）。 */
function localizeRedeemMessage(msg: string): string {
  const map: Record<string, string> = {
    "Invalid redeem code": "兑换码无效",
    "This code has already been used": "该兑换码已被使用",
    "This code has been revoked": "该兑换码已被作废",
    "This code has expired": "该兑换码已过期",
    "This code is no longer valid": "该兑换码已失效",
  };
  return map[msg] || msg;
}

export default function RedeemPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    expiry?: string | null;
  } | null>(null);
  const [redirectIn, setRedirectIn] = useState(0);

  // Success -> countdown redirect (原型 19 success-redirect).
  useEffect(() => {
    if (!result?.success) return;
    setRedirectIn(3);
    const id = setInterval(() => {
      setRedirectIn((n) => {
        if (n <= 1) {
          clearInterval(id);
          router.push("/");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [result, router]);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < TOTAL_LENGTH) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api<{
        success: boolean;
        message: string;
        plan_expires_at?: string | null;
      }>("/api/v1/redeem-codes/redeem", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (res.success) {
        const expiry = res.plan_expires_at
          ? new Date(res.plan_expires_at).toLocaleDateString("zh-CN")
          : null;
        setResult({
          success: true,
          message: "Pro 会员已激活！",
          expiry,
        });
      } else {
        setResult({
          success: false,
          message: localizeRedeemMessage(res.message),
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: localizeRedeemMessage(apiErrorMessage(err, "兑换失败")),
      });
    } finally {
      setLoading(false);
    }
  }

  const success = result?.success;

  return (
    <main className="flex min-h-full items-center justify-center px-4 bg-canvas relative">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Gift size={28} />
          </div>
          <h1 className="mt-5 font-display text-3xl font-normal text-ink tracking-display-md">
            兑换 Pro 会员
          </h1>
          <p className="mt-2 text-sm text-muted">输入购买获得的兑换码，立即升级</p>
        </div>

        {!isAuthenticated ? (
          <div className="mt-8 rounded-lg border border-amber-200 bg-warning-soft p-4 text-center dark:border-amber-900">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              请先
              <a href="/login" className="font-semibold underline">
                登录
              </a>
              或
              <a href="/register" className="font-semibold underline">
                注册
              </a>
              账号后兑换
            </p>
          </div>
        ) : (
          <form onSubmit={handleRedeem} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-2 text-center">兑换码</label>
              <CodeInput
                onChange={setCode}
                hasError={!!result && !success}
                disabled={loading || !!success}
              />
              <p className="mt-2 text-center text-xs text-muted-soft">
                格式：XXXX-XXXX-XX（共 10 位）
              </p>
            </div>

            {result && !success && (
              <div className="rounded-md p-3 text-sm bg-red-soft text-error border border-error/30 flex items-start gap-2">
                <span className="font-mono">{code}</span>
                <span>{result.message}</span>
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              disabled={loading || code.length < TOTAL_LENGTH || !!success}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? "兑换中..." : "激活 Pro"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted">兑换码通过微信小商店购买后获得</p>
      </div>

      {/* Success overlay (原型 19 success-overlay) */}
      {success && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4 animate-fade-in">
          <div className="w-full max-w-sm bg-canvas rounded-2xl border border-hairline shadow-lift p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-success-soft flex items-center justify-center mb-4">
              <PartyPopper size={32} className="text-success" />
            </div>
            <h2 className="text-xl font-bold text-ink">{result?.message}</h2>
            {result?.expiry && (
              <p className="mt-2 text-sm text-muted">
                有效期至 <strong className="text-ink font-mono">{result.expiry}</strong>
              </p>
            )}
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
              <CheckCircle2 size={15} className="text-success" />
              {redirectIn > 0 ? `${redirectIn} 秒后返回首页` : "正在跳转…"}
            </div>
            <button
              onClick={() => router.push("/")}
              className="mt-4 text-sm text-brand-500 hover:underline font-medium"
            >
              立即返回
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
