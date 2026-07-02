import Link from "next/link";
import { ComplianceInfo } from "@/components/common/ComplianceInfo";

const footerLinks = {
  产品: [
    { label: "浏览视频", href: "/browse" },
    { label: "创作者中心", href: "/my-videos" },
    { label: "价格", href: "/landing#pricing" },
  ],
  学习: [
    { label: "词汇本", href: "/vocabulary" },
    { label: "学习面板", href: "/dashboard" },
    { label: "社区", href: "/community" },
  ],
  法律: [
    { label: "用户协议", href: "/terms" },
    { label: "隐私政策", href: "/privacy" },
    { label: "开通会员", href: "/upgrade" },
  ],
};

export function LandingFooter() {
  return (
    <footer className="border-t border-hairline py-12">
      <div className="container-page">
        <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr] gap-9">
          {/* Brand + blurb */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-on-primary text-base font-extrabold shadow-brand">
                S
              </span>
              <span className="text-[17px] font-display font-bold text-ink tracking-tight">
                Speaking
              </span>
            </Link>
            <p className="text-[13px] text-muted leading-relaxed mt-3 max-w-[280px]">
              用真实视频学开口说英语。AI 驱动的双语字幕、口语评测和理解测验。
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-[13px] font-bold mb-3.5">{title}</h4>
              <div className="flex flex-col gap-1">
                {links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-[13px] text-muted py-1 hover:text-ink transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-hairline text-center">
          <div className="text-[12px] text-muted-soft">
            © {new Date().getFullYear()} Speaking. All rights reserved.
          </div>
          <ComplianceInfo className="mt-2" />
        </div>
      </div>
    </footer>
  );
}
