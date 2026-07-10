"use client";

import { Check } from "lucide-react";
import { LinkButton } from "@/components/ui/LinkButton";
import { PriceCard } from "@/components/ui/PriceCard";
import { useAuthStore } from "@/stores/authStore";
import type { ButtonVariant } from "@/components/ui/Button";

const plans: {
  name: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  cta: string;
  ctaAuthed: string;
  hrefAuthed: string;
  ctaVariant: ButtonVariant;
  popular: boolean;
}[] = [
  {
    name: "Free",
    price: "¥0",
    period: "/永久",
    desc: "体验核心功能",
    features: ["每天 3 个视频", "双语字幕阅读", "基础词汇本", "考级词汇标注"],
    cta: "免费开始",
    ctaAuthed: "进入应用",
    hrefAuthed: "/",
    ctaVariant: "outline",
    popular: false,
  },
  {
    name: "Pro",
    price: "¥9.9",
    period: "/月",
    desc: "解锁全部学习功能",
    features: [
      "无限视频与双语字幕",
      "AI 词汇注释查询",
      "SM-2 无限词汇复习",
      "创作者优先审核",
    ],
    cta: "升级 Pro",
    ctaAuthed: "前往升级",
    hrefAuthed: "/upgrade",
    ctaVariant: "primary",
    popular: true,
  },
];

export function PricingSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <section id="pricing" className="py-[88px]">
      <div className="container-page">
        <div className="text-center max-w-[640px] mx-auto mb-14">
          <span className="text-[13px] font-bold text-brand-500 uppercase tracking-[0.04em]">
            价格
          </span>
          <h2 className="!text-[44px] !font-extrabold !tracking-[-0.03em] !leading-tight mt-3.5 mb-4">
            简单透明的定价
          </h2>
          <p className="text-[17px] text-muted leading-relaxed">
            免费开始，需要更多再升级。无隐藏费用。
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] max-w-[760px] mx-auto">
          {plans.map((p) => (
            <PriceCard key={p.name} popular={p.popular}>
              <div className="text-[15px] font-bold text-muted">{p.name}</div>
              <div className="text-[42px] font-extrabold tracking-display-lg mt-2.5 mb-1">
                {p.price}
                <small className="text-[15px] font-medium text-muted">
                  {p.period}
                </small>
              </div>
              <div className="text-[13px] text-muted mb-5">{p.desc}</div>
              <ul className="flex-1 flex flex-col gap-2.5 mb-6">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2 items-start text-sm text-body"
                  >
                    <Check
                      size={16}
                      className="text-success mt-0.5 flex-shrink-0"
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton
                href={isAuthenticated ? p.hrefAuthed : "/register"}
                variant={p.ctaVariant}
                fullWidth
                size="nav"
              >
                {isAuthenticated ? p.ctaAuthed : p.cta}
              </LinkButton>
            </PriceCard>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-soft">
          Pro 会员 ¥9.9/月，30
          天/码，可叠加。通过微信小商店购买后使用兑换码激活。本站为非经营性工具展示平台，不提供在线支付。
        </p>
      </div>
    </section>
  );
}
