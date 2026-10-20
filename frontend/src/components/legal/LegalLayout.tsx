"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { siteConfig } from "@/lib/siteConfig";
import { AuthThemeToggle } from "@/components/auth/AuthThemeToggle";
import { cn } from "@/lib/utils";
import { ComplianceInfo } from "@/components/common/ComplianceInfo";

export interface LegalSection {
  id: string;
  title: string;
}

interface LegalLayoutProps {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
  children: ReactNode;
  /** 同组另一份协议（设计页脚「查看隐私政策 / 查看用户协议」互链）。 */
  siblingHref: string;
  siblingLabel: string;
}

/**
 * 法律页共享布局（设计 20/21）：品牌页头 + 顶部阅读进度条 + 左侧 240px 目录卡片
 * （手机端目录卡片在正文上方，不隐藏）+ 384px 正文列；正文用 16/28 读宽。
 */
export function LegalLayout({
  title,
  updatedAt,
  sections,
  children,
  siblingHref,
  siblingLabel,
}: LegalLayoutProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const [progress, setProgress] = useState(0);
  const articleRef = useRef<HTMLElement>(null);

  // Scroll progress + active section via IntersectionObserver.
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    function onScroll() {
      const el = articleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.scrollHeight - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      setProgress(total > 0 ? (scrolled / total) * 100 : 0);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }

  return (
    <main className="user-ui relative min-h-dvh bg-canvas">
      {/* Reading progress bar (顶部) */}
      <div className="fixed top-0 left-0 right-0 z-40 h-1 bg-hairline-soft">
        <div
          className="h-full bg-brand-500 transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mx-auto w-full max-w-[44rem] px-5 pt-6 pb-10 md:px-6">
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
          <AuthThemeToggle />
        </div>

        <h1 className="font-display text-display-sm font-bold leading-8 tracking-display-md text-ink md:text-display md:leading-[38px]">
          {title}
        </h1>
        <p className="mt-2 text-meta text-muted">最后更新：{updatedAt}</p>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          {/* TOC：手机端在正文上方，桌面 240px 卡片 + sticky */}
          <aside className="order-first">
            <nav
              aria-label="条款目录"
              className="rounded-lg border border-hairline bg-surface-soft p-5 lg:sticky lg:top-6"
            >
              <p className="mb-3 text-meta font-bold tracking-[0.04em] text-muted">目录</p>
              <ol className="flex flex-col gap-1.5">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => handleClick(e, s.id)}
                      className={cn(
                        "block rounded-sm border-l-2 py-0.5 pl-3 text-copy leading-6 transition-colors",
                        activeId === s.id
                          ? "border-brand-700 font-medium text-ink"
                          : "border-transparent text-body hover:text-ink"
                      )}
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
              <span className="mt-3 block text-caption text-muted">共 {sections.length} 节</span>
            </nav>
          </aside>

          {/* Article body */}
          <article ref={articleRef} className="min-w-0">
            <div className="space-y-7 text-copy-lg leading-7 text-body">{children}</div>
            <div className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline pt-6 text-copy text-muted">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-muted transition-colors hover:text-ink"
              >
                <ArrowLeft size={13} aria-hidden="true" />
                返回首页
              </Link>
              <span aria-hidden="true">·</span>
              <Link href={siblingHref} className="text-muted transition-colors hover:text-ink">
                {siblingLabel}
              </Link>
            </div>
          </article>
        </div>
        <ComplianceInfo className="mt-8 text-center" />
      </div>
    </main>
  );
}
