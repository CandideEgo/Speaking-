import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/lib/siteConfig";

/**
 * Shared outer shell for the account flow (login / register / forgot-password /
 * set-password / redirect recovery). Single centered column, max 400px, with
 * the brand lockup (`/logo.png` + wordmark) above the title/subtitle.
 *
 * 原型「注册 / 登录 / 找回密码 / 设置密码」共用同一居中壳层；管理员登录页
 * 有自己的壳，不在此列。
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh justify-center bg-canvas px-5 py-10">
      <div className="my-auto w-full max-w-[400px]">
        <Link
          href="/"
          aria-label={`${siteConfig.brandName} 首页`}
          className="mb-[34px] flex items-center gap-[9px]"
        >
          <Image src="/logo.png" alt="" width={26} height={26} className="rounded-sm" priority />
          <span className="font-display text-copy-lg font-bold tracking-display-sm text-ink">
            {siteConfig.brandName}
          </span>
        </Link>

        <header className="mb-[22px]">
          <h1 className="font-display text-display-sm font-bold tracking-display-md text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-copy leading-relaxed text-muted">{subtitle}</p>}
        </header>

        {children}
      </div>
    </main>
  );
}
