import Link from "next/link";
import { ShoppingBag, Gift, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "开通会员 — Speaking",
};

export default function CheckoutPage() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-lg bg-coral/10 text-coral">
          <ShoppingBag size={28} />
        </div>
        <h1 className="mt-5 font-display text-2xl font-normal text-ink tracking-display-sm">
          本站不支持在线支付
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          本网站为非经营性工具展示平台，不提供站内支付功能。
          <br />
          请前往微信小商店购买 Pro 会员，购买后使用兑换码激活。
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link href="/upgrade" className="btn-primary justify-center">
            <ShoppingBag size={16} />
            前往微信小商店
          </Link>
          <Link href="/redeem" className="btn-secondary-dark justify-center">
            <Gift size={16} />
            使用兑换码激活
          </Link>
        </div>

        <Link
          href="/pricing"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft size={14} />
          返回定价页
        </Link>
      </div>
    </main>
  );
}
