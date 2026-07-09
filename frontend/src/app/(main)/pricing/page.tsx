"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/authStore";
import { CheckCircle2, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { PriceCard } from "@/components/ui/PriceCard";
import { api, isProUser } from "@/lib/api";

const PLANS = [
  {
    id: "pro_monthly",
    name: "Pro 月度",
    price: "¥9.9",
    priceFen: 990,
    period: "/月",
    duration_days: 30,
    desc: "30 天有效,可叠加续期",
    features: [
      "无限视频与双语字幕",
      "AI 词汇注释查询",
      "SM-2 无限词汇复习",
      "考级词汇标注",
      "创作者优先审核",
    ],
    popular: true,
  },
];

const COMPARISON = [
  { feature: "每日视频观看", free: "3 个", pro: "无限" },
  { feature: "双语字幕", free: true, pro: true },
  { feature: "考级词汇标注", free: true, pro: true },
  { feature: "AI 词汇注释", free: false, pro: true },
  { feature: "SM-2 词汇复习", free: "基础", pro: "无限" },
  { feature: "创作者优先审核", free: false, pro: true },
];

function CheckOrDash({ value }: { value: boolean | string }) {
  if (typeof value === "string")
    return <span className="text-ink">{value}</span>;
  if (value) return <CheckCircle2 size={15} className="text-success mx-auto" />;
  return <span className="text-muted-soft">—</span>;
}

export default function PricingPage() {
  const { user, isAuthenticated } = useAuthStore();
  // AuthUser (from JWT) lacks plan/plan_expires_at, so fetch /payments/status
  // which returns the backend's authoritative is_pro computation.
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    api<{ is_pro: boolean }>("/api/v1/payments/status")
      .then((data) => setIsPro(data.is_pro))
      .catch(() => setIsPro(false));
  }, [isAuthenticated]);

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        {/* Page header */}
        <PageHeader
          crumb="升级"
          title="选择适合你的计划"
          description="免费开始,需要更多功能再升级。Pro 会员 ¥9.9/月,30 天/码,可叠加。"
          centered
        />

        {/* 合规提示 */}
        <div className="mt-6 max-w-[820px] mx-auto rounded-lg border border-hairline bg-surface-card p-4 text-center text-[13px] leading-relaxed text-muted">
          本网站为非经营性工具展示平台，不提供在线支付。Pro 会员通过
          <span className="font-medium text-ink"> 微信小商店 </span>
          购买，购买后使用
          <a href="/redeem" className="font-medium text-brand-500 underline">
            兑换码
          </a>
          激活。
        </div>

        {isPro && (
          <div className="mt-6 rounded-lg border border-green-200 bg-success-soft p-4 text-center">
            <CheckCircle2
              size={18}
              className="inline mr-1.5 -mt-0.5 text-success"
            />
            <span className="text-sm text-success">你已是 Pro 会员</span>
          </div>
        )}

        {/* Plan cards */}
        <div className="max-w-[400px] mx-auto mt-9">
          {PLANS.map((plan) => (
            <PriceCard key={plan.id} popular={plan.popular}>
              <div className="text-[15px] font-bold text-muted">
                {plan.name}
              </div>
              <div className="mt-2.5 mb-1">
                <span className="text-[42px] font-extrabold tracking-display-lg">
                  {plan.price}
                </span>
                <small className="text-[15px] font-medium text-muted">
                  {plan.period}
                </small>
              </div>
              <div className="text-[13px] text-muted mb-5">{plan.desc}</div>
              <ul className="flex-1 flex flex-col gap-2.5 mb-6">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2 items-start text-sm text-body"
                  >
                    <CheckCircle2
                      size={16}
                      className="text-success mt-0.5 flex-shrink-0"
                    />
                    {f}
                  </li>
                ))}
              </ul>
              {isPro ? (
                <div
                  className={cn(
                    "w-full justify-center !py-2.5 text-sm block text-center rounded-sm font-semibold opacity-50 cursor-not-allowed",
                    plan.popular
                      ? "bg-brand-500 text-on-primary"
                      : "bg-ink text-on-primary",
                  )}
                >
                  已是 Pro
                </div>
              ) : (
                <Link
                  href="/upgrade"
                  className={cn(
                    "w-full justify-center !py-2.5 text-sm flex items-center gap-1.5 text-center rounded-sm font-semibold transition-all duration-150",
                    plan.popular
                      ? "bg-brand-500 text-on-primary shadow-brand hover:bg-brand-600 hover:-translate-y-0.5"
                      : "bg-ink text-on-primary hover:bg-black hover:-translate-y-0.5",
                  )}
                >
                  <ShoppingBag size={15} />
                  前往小商店购买
                </Link>
              )}
            </PriceCard>
          ))}
        </div>

        {/* Feature comparison */}
        <div className="bg-canvas border border-hairline rounded-lg p-6 max-w-[820px] mx-auto mt-9">
          <h3 className="!text-base !font-bold !m-0 !mb-1">功能对比</h3>
          <p className="text-[13px] text-muted !m-0 !mb-5">
            看看免费版和 Pro 版的区别
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-0 text-[13px]">
            <div className="py-3 border-b border-hairline font-semibold hidden sm:block">
              功能
            </div>
            <div className="py-3 border-b border-hairline text-center font-semibold text-muted hidden sm:block">
              Free
            </div>
            <div className="py-3 border-b border-hairline text-center font-semibold text-brand-500 hidden sm:block">
              Pro
            </div>
            {COMPARISON.map((row) => (
              <div key={row.feature} className="contents">
                <div className="py-3 border-b border-surface-card">
                  <span className="sm:hidden text-[11px] font-semibold text-muted block mb-1">
                    功能
                  </span>
                  {row.feature}
                </div>
                <div className="py-3 border-b border-surface-card text-center">
                  <span className="sm:hidden text-[11px] font-semibold text-muted block mb-1">
                    Free
                  </span>
                  <CheckOrDash value={row.free} />
                </div>
                <div className="py-3 border-b border-surface-card text-center">
                  <span className="sm:hidden text-[11px] font-semibold text-brand-500 block mb-1">
                    Pro
                  </span>
                  <CheckOrDash value={row.pro} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          已购买？通过
          <a href="/redeem" className="underline hover:text-ink">
            兑换码
          </a>
          激活 Pro 会员
        </p>
      </div>
    </main>
  );
}
