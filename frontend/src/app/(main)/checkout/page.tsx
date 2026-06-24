"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { OrderStatusResponse } from "@/types";
import { Loader2, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");

  const [order, setOrder] = useState<OrderStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api<OrderStatusResponse>(`/api/v1/payments/order/${orderId}`);
      setOrder(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询订单失败");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Initial fetch + polling
  useEffect(() => {
    if (!orderId) {
      setError("缺少订单号");
      setLoading(false);
      return;
    }
    pollOrder();
    const interval = setInterval(pollOrder, 3000);
    return () => clearInterval(interval);
  }, [orderId, pollOrder]);

  // Auto-redirect on payment success
  useEffect(() => {
    if (order?.status === "paid") {
      const timer = setTimeout(() => router.push("/dashboard"), 2000);
      return () => clearTimeout(timer);
    }
  }, [order?.status, router]);

  if (!orderId) {
    return (
      <main className="flex min-h-full items-center justify-center px-4 bg-canvas">
        <div className="text-center">
          <XCircle size={48} className="mx-auto text-red-400" />
          <h1 className="mt-4 text-xl font-semibold text-ink">缺少订单号</h1>
          <button onClick={() => router.push("/pricing")} className="btn-primary mt-4">
            返回定价页
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm text-center">
        {loading && !order ? (
          <>
            <Loader2 size={48} className="mx-auto animate-spin text-brand-500" />
            <h1 className="mt-4 text-xl font-semibold text-ink">正在查询订单...</h1>
          </>
        ) : order?.status === "paid" ? (
          <>
            <CheckCircle2 size={48} className="mx-auto text-green-500" />
            <h1 className="mt-4 text-xl font-semibold text-ink">支付成功！</h1>
            <p className="mt-2 text-sm text-muted">已升级为 Pro 会员，正在跳转...</p>
          </>
        ) : order?.status === "expired" ? (
          <>
            <XCircle size={48} className="mx-auto text-amber-500" />
            <h1 className="mt-4 text-xl font-semibold text-ink">订单已过期</h1>
            <p className="mt-2 text-sm text-muted">支付超时，请重新下单</p>
            <button onClick={() => router.push("/pricing")} className="btn-primary mt-4">
              重新选择方案
            </button>
          </>
        ) : order?.status === "cancelled" ? (
          <>
            <XCircle size={48} className="mx-auto text-red-400" />
            <h1 className="mt-4 text-xl font-semibold text-ink">订单已取消</h1>
            <button onClick={() => router.push("/pricing")} className="btn-primary mt-4">
              重新选择方案
            </button>
          </>
        ) : (
          <>
            <Loader2 size={48} className="mx-auto animate-spin text-brand-500" />
            <h1 className="mt-4 text-xl font-semibold text-ink">等待支付...</h1>
            <p className="mt-2 text-sm text-muted">
              订单号: {orderId}
              <br />
              金额: ¥{(order?.amount ?? 0) / 100}
            </p>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </>
        )}

        <button
          onClick={() => router.push("/pricing")}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft size={14} />
          返回定价页
        </button>
      </div>
    </main>
  );
}
