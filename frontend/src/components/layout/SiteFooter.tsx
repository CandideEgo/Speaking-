import Link from "next/link";
import { ComplianceInfo } from "@/components/common/ComplianceInfo";

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline py-6 text-center text-caption text-muted">
      <nav aria-label="服务信息" className="mb-2 flex flex-wrap justify-center gap-x-5 gap-y-2">
        <Link href="/terms" className="hover:text-ink">
          用户协议
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          隐私政策
        </Link>
        <Link href="/contact" className="hover:text-ink">
          帮助与反馈
        </Link>
      </nav>
      <ComplianceInfo />
    </footer>
  );
}
