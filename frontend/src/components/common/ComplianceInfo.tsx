import { siteConfig } from "@/lib/siteConfig";

/**
 * 合规公示信息：个体工商户主体 + ICP 备案 + 公安网安备案。
 *
 * 用于 Footer / Sidebar 底部。所有字段来自 NEXT_PUBLIC_* 环境变量，
 * 未备案时渲染"备案信息准备中"占位，取得备案后无需改代码即可生效。
 */
export function ComplianceInfo({ className = "" }: { className?: string }) {
  const { companyName, companyUscc, icpBeian, policeBeian } = siteConfig;

  return (
    <div className={`text-[11px] leading-relaxed text-muted-soft ${className}`}>
      {companyName && (
        <div>
          {companyName}
          {companyUscc ? ` · 统一社会信用代码 ${companyUscc}` : ""}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
        {icpBeian ? (
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink transition-colors"
          >
            {icpBeian}
          </a>
        ) : (
          <span>ICP 备案准备中</span>
        )}
        {policeBeian && (
          <a
            href="https://beian.mps.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink transition-colors"
          >
            {policeBeian}
          </a>
        )}
      </div>
    </div>
  );
}
