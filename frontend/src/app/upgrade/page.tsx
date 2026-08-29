"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, Gift, ShieldCheck, Check } from "lucide-react";
import { siteConfig } from "@/lib/siteConfig";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";

/** 三步指引（原型 18 steps-list）。 */
const STEPS = [
  { t: "前往微信小商店购买", d: "在小商店完成支付，获得 Pro 会员兑换码" },
  { t: "复制兑换码", d: "格式为 XXXX-XXXX-XX，共 10 位" },
  { t: "回本站激活", d: "在兑换页输入兑换码，立即开通 Pro 权益" },
];

/** D11 权益列表（与解锁面板升级态 §2.4 对齐，只强调无限解锁观看）。 */
const PRO_PERKS = [
  "所有视频无限解锁、随时观看",
  "双语字幕 + AI 词注释",
  "真题练习 + 词汇复习",
  "跟读录音",
];

export default function UpgradePage() {
  const { miniStoreUrl } = siteConfig;
  const [storeUnavailable, setStoreUnavailable] = useState(false);

  function openMiniStore() {
    if (miniStoreUrl) {
      window.open(miniStoreUrl, "_blank", "noopener,noreferrer");
    } else {
      setStoreUnavailable(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-hairline bg-surface-card p-7 sm:p-8">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
            <ShoppingBag size={28} />
          </div>
          <h1 className="mt-5 text-center font-display text-2xl font-normal text-ink tracking-display-sm">
            开通 Pro 会员
          </h1>
          <p className="mt-2 text-center text-sm text-muted">
            无限解锁所有视频 · ¥9.9 / 月 · 兑换码激活
          </p>

          {/* D11 权益列表（对齐 §2.4，不堆 AI 功能） */}
          <ul className="mt-5 space-y-2">
            {PRO_PERKS.map((perk) => (
              <li key={perk} className="flex items-center gap-2.5 text-sm text-body">
                <Check size={15} className="flex-shrink-0 text-brand-500" />
                {perk}
              </li>
            ))}
          </ul>

          {/* 合规告知 */}
          <div className="mt-5 flex gap-2.5 rounded-md border border-hairline bg-canvas p-3.5">
            <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-success" />
            <p className="text-[13px] leading-relaxed text-muted">
              本网站为
              <strong className="font-medium text-ink">非经营性工具展示平台</strong>，
              不提供在线支付功能。Pro 会员通过微信小商店购买，购买后使用兑换码激活。
            </p>
          </div>

          {/* 三步指引（原型 18） */}
          <div className="mt-6">
            <p className="mb-3 text-center text-[13px] font-bold uppercase tracking-wide text-muted">
              如何开通
            </p>
            <div className="flex flex-col gap-3">
              {STEPS.map((s, i) => (
                <div
                  key={s.t}
                  className="flex gap-3.5 items-start rounded-md border border-hairline bg-canvas p-3.5"
                >
                  <span className="w-7 h-7 rounded-full bg-ink text-canvas flex items-center justify-center text-[13px] font-bold font-mono flex-shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-ink">{s.t}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted">{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 小商店入口 */}
          <div className="mt-6">
            <Button fullWidth onClick={openMiniStore} icon={ShoppingBag}>
              前往微信小商店购买
            </Button>
            {storeUnavailable && !miniStoreUrl && (
              <div className="mt-3 rounded-md border border-amber-200 bg-warning-soft p-3.5 text-center text-[13px] leading-relaxed text-amber-800 dark:border-amber-900 dark:text-amber-300">
                微信小商店即将开通，暂未开放购买。
                <br />
                如需提前开通会员，请联系客服。
              </div>
            )}
          </div>

          {/* 兑换码入口 */}
          <div className="mt-3.5">
            <LinkButton href="/redeem" variant="secondaryDark" icon={Gift} fullWidth>
              已购买？使用兑换码激活
            </LinkButton>
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
      </div>
    </main>
  );
}
