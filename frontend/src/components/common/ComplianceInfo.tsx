import { siteConfig } from "@/lib/siteConfig";

/**
 * 合规公示信息：个体工商户主体 + ICP 备案 + 公安网安备案。
 *
 * 用于用户端页脚和公开账号页面。仅显示已配置的 NEXT_PUBLIC_* 公示字段。
 */
export function ComplianceInfo({ className = "" }: { className?: string }) {
  const { companyName, companyUscc, icpBeian, policeBeian } = siteConfig;
  if (!companyName && !icpBeian && !policeBeian) return null;

  return (
    <div className={`text-caption leading-relaxed text-muted-soft ${className}`}>
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
        ) : null}
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
