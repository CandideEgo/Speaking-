import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/lib/siteConfig";
import { AuthThemeToggle } from "@/components/auth/AuthThemeToggle";
import { cn } from "@/lib/utils";
import { ComplianceInfo } from "@/components/common/ComplianceInfo";

/**
 * 账号流程（login / register / forgot-password / set-password / onboarding /
 * redirect recovery）的公共壳：单列、顶部对齐，表单页 480px、引导页 44rem
 * （设计 `auth.css` 的 `.auth-shell` / `.auth-shell-wide`），品牌与主题切换同排。
 *
 * 注意：`user-ui.css` 的 `.user-auth > div` 把**直接子 div** 限到 30rem，所以
 * wide 版用 `<section>` 承载宽度，避免被该规则盖掉 `max-w-[44rem]`。
 *
 * 标题/副标题字号由 `user-ui.css` 的 `.user-auth h1` / `.user-auth header p`
 * 提供，页面里不再各自写字号（避免与设计档位打架）。
 */
export function AuthCard({
  title,
  children,
  wide = false,
  headerActions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** `auth-shell-wide`（44rem）：引导页使用。 */
  wide?: boolean;
  /** 页头右侧除主题切换外的附加动作（例如引导页的「跳过设置」）。 */
  headerActions?: React.ReactNode;
}) {
  const content = (
    <>
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link
          href="/"
          aria-label={`${siteConfig.brandName} 首页`}
          className="flex min-w-0 items-center gap-2 rounded-sm"
        >
          <Image src="/logo.png" alt="" width={26} height={26} className="rounded-sm" priority />
          <span className="font-display text-[17px] font-extrabold tracking-[-0.03em] text-ink">
            {siteConfig.brandName}
          </span>
        </Link>
        <div className="flex flex-none items-center gap-3">
          {headerActions}
          <AuthThemeToggle />
        </div>
      </div>

      <header>
        <h1 className={cn("font-display text-ink", wide && "max-w-[40rem]")}>{title}</h1>
      </header>

      {children}
      <ComplianceInfo className="mt-6 text-center" />
    </>
  );

  return (
    <main className="user-ui user-auth min-h-dvh bg-canvas px-5 pt-6 pb-10 md:px-6">
      {wide ? (
        <section className="mx-auto w-full max-w-[44rem]">{content}</section>
      ) : (
        <div className="mx-auto w-full max-w-[480px]">{content}</div>
      )}
    </main>
  );
}
