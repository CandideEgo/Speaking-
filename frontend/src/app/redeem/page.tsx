'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';

export default function RedeemPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const loggedIn = typeof window !== 'undefined' && !!getToken();

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await api<{ success: boolean; message: string }>(
        '/api/v1/invite-codes/redeem',
        {
          method: 'POST',
          body: JSON.stringify({ code: code.trim() }),
        }
      );
      setResult(res);
      if (res.success) {
        setTimeout(() => router.push('/dashboard'), 2000);
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : '兑换失败',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
            <Sparkles size={24} className="text-brand-600" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">兑换 Pro 会员</h1>
          <p className="mt-2 text-sm text-slate-600">
            输入购买获得的兑换码，立即升级
          </p>
        </div>

        {!loggedIn ? (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm text-amber-800">
              请先<a href="/login" className="font-semibold underline">登录</a>或<a href="/register" className="font-semibold underline">注册</a>账号，再使用兑换码
            </p>
          </div>
        ) : (
          <form onSubmit={handleRedeem} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">兑换码</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XX"
                maxLength={12}
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-lg tracking-widest font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {result && (
              <div className={`rounded-lg p-3 text-sm ${
                result.success
                  ? 'bg-green-50 text-green-800'
                  : 'bg-red-50 text-red-600'
              }`}>
                {result.success && <CheckCircle2 size={16} className="inline mr-1 -mt-0.5" />}
                {result.message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? '兑换中...' : '激活 Pro'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          兑换码通过电商平台购买获得
        </p>
      </div>
    </main>
  );
}
