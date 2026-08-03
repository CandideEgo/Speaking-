"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LegalSection {
  id: string;
  title: string;
}

interface LegalLayoutProps {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
  children: ReactNode;
}

/**
 * 法律页共享布局（原型 20/21）：左 sticky TOC + 顶部阅读进度条 + active 高亮。
 * 接收章节 id/标题列表驱动 TOC，正文由 children 渲染（每个 <section id=...> 对应一项）。
 */
export function LegalLayout({ title, updatedAt, sections, children }: LegalLayoutProps) {
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
    <main className="min-h-screen bg-canvas">
      {/* Reading progress bar (顶部) */}
      <div className="fixed top-0 left-0 right-0 h-1 z-40 bg-hairline-soft">
        <div
          className="h-full bg-brand-500 transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="container-page max-w-5xl py-10 px-4 sm:px-7">
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-10">
          {/* TOC - sticky on desktop, hidden on mobile */}
          <aside className="hidden lg:block">
            <div className="sticky top-10">
              <div className="text-xs font-semibold text-muted-soft uppercase tracking-wider mb-3">
                目录
              </div>
              <nav className="space-y-1 border-l border-hairline">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={(e) => handleClick(e, s.id)}
                    className={cn(
                      "block text-[13px] py-1.5 -ml-px border-l-2 transition-colors",
                      activeId === s.id
                        ? "border-brand-500 text-brand-600 font-medium pl-3"
                        : "border-transparent text-muted hover:text-ink pl-3"
                    )}
                  >
                    {s.title}
                  </a>
                ))}
              </nav>
              <Link
                href="/"
                className="inline-flex items-center gap-1 mt-6 text-xs text-muted hover:text-ink transition-colors"
              >
                <ArrowLeft size={13} />
                返回首页
              </Link>
            </div>
          </aside>

          {/* Article body */}
          <article ref={articleRef}>
            <h1 className="font-display text-3xl font-normal text-ink tracking-display-md">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted">最后更新：{updatedAt}</p>
            <div className="mt-8 space-y-6 text-sm leading-relaxed text-body">{children}</div>
            <div className="mt-10 border-t border-hairline pt-6 text-sm text-muted lg:hidden">
              <Link href="/" className="text-brand-500 hover:underline">
                ← 返回首页
              </Link>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
