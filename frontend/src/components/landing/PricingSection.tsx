import { Check } from "lucide-react";
import { LinkButton } from "@/components/ui/LinkButton";
import { PriceCard } from "@/components/ui/PriceCard";
import type { ButtonVariant } from "@/components/ui/Button";

const plans: {
  name: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  cta: string;
  ctaVariant: ButtonVariant;
  popular: boolean;
}[] = [
  {
    name: "Free",
    price: "¥0",
    period: "/永久",
    desc: "体验核心功能",
    features: ["每天 3 个视频", "双语字幕阅读", "基础词汇本"],
    cta: "免费开始",
    ctaVariant: "outline",
    popular: false,
  },
  {
    name: "Pro 月度",
    price: "¥39",
    period: "/月",
    desc: "解锁全部 AI 功能",
    features: [
      "无限视频 + 口语评测",
      "逐词评分与反馈",
      "AI 词汇查询",
      "每日学习总结",
    ],
    cta: "升级 Pro",
    ctaVariant: "primary",
    popular: true,
  },
  {
    name: "Pro 年度",
    price: "¥299",
    period: "/年",
    desc: "省 ¥169 · 月均 ¥24.9",
    features: ["Pro 月度全部功能", "优先客服支持", "优先新功能体验"],
    cta: "选择年度",
    ctaVariant: "dark",
    popular: false,
  },
];

export function PricingSection() {
  return (
    <section className="py-[88px]">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] max-w-[980px] mx-auto">
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
                href="/register"
                variant={p.ctaVariant}
                fullWidth
                size="nav"
              >
                {p.cta}
              </LinkButton>
            </PriceCard>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-soft">
          会员通过微信小商店购买，购买后使用兑换码激活。本站为非经营性工具展示平台，不提供在线支付。
        </p>
      </div>
    </section>
  );
}
