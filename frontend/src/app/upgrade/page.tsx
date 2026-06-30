"use client";

import Link from "next/link";
import { ShoppingBag, Gift, ShieldCheck, ArrowLeft } from "lucide-react";
import { siteConfig } from "@/lib/siteConfig";
import { Button } from "@/components/ui/Button";

export default function UpgradePage() {
  const { miniStoreUrl } = siteConfig;

  function openMiniStore() {
    if (miniStoreUrl) {
      window.open(miniStoreUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-hairline bg-surface-card p-7 sm:p-8">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-lg bg-coral/10 text-coral">
            <ShoppingBag size={28} />
          </div>
          <h1 className="mt-5 text-center font-display text-2xl font-normal text-ink tracking-display-sm">
            开通 Pro 会员
          </h1>

          {/* 合规告知 */}
          <div className="mt-5 flex gap-2.5 rounded-md border border-hairline bg-canvas p-3.5">
            <ShieldCheck
              size={16}
              className="mt-0.5 flex-shrink-0 text-success"
            />
            <p className="text-[13px] leading-relaxed text-muted">
              本网站为
              <strong className="font-medium text-ink">
                非经营性工具展示平台
              </strong>
              ， 不提供在线支付功能。Pro
              会员通过微信小商店购买，购买后使用兑换码激活。
            </p>
          </div>

          {/* 小商店入口 */}
          <div className="mt-6">
            {miniStoreUrl ? (
              <Button fullWidth onClick={openMiniStore} icon={ShoppingBag}>
                前往微信小商店购买
              </Button>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3.5 text-center text-[13px] leading-relaxed text-amber-800">
                微信小商店即将开通，暂未开放购买。
                <br />
                如需提前开通会员，请联系客服。
              </div>
            )}
          </div>

          {/* 兑换码入口 */}
          <div className="mt-3.5">
            <Link
              href="/redeem"
              className="btn-secondary-dark w-full justify-center"
            >
              <Gift size={16} />
              已购买？使用兑换码激活
            </Link>
          </div>

          <div className="mt-5 flex items-center justify-center gap-3 text-xs text-muted-soft">
            <Link href="/terms" className="hover:text-ink">
              用户协议
            </Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-ink">
              隐私政策
            </Link>
          </div>
        </div>

        <Link
          href="/pricing"
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft size={14} />
          返回定价页
        </Link>
      </div>
    </main>
  );
}
