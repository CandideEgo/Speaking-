"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/authStore";

const NAV_LINKS = [
  { label: "功能", href: "#features" },
  { label: "内容库", href: "#content" },
  { label: "价格", href: "#pricing" },
  { label: "关于", href: "#about" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-canvas/95 backdrop-blur-sm border-b border-hairline shadow-soft"
          : "bg-transparent"
      }`}
    >
      <div className="container-page flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-on-primary text-base font-extrabold shadow-brand">
            S
          </span>
          <span className="text-[17px] font-display font-bold text-ink tracking-tight">
            Speaking
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-semibold text-olive hover:text-ink transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <Link href="/dashboard" className="btn-primary !py-2 !px-5 text-[13px]">
              进入控制台
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost text-[13px]">
                登录
              </Link>
              <Link href="/register" className="btn-primary !py-2 !px-5 text-[13px]">
                免费试用
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden btn-icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="菜单"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-canvas border-b border-hairline px-7 pb-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="block py-2.5 text-sm font-semibold text-olive hover:text-ink"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="flex gap-3 mt-3 pt-3 border-t border-hairline">
            {isAuthenticated ? (
              <Link href="/dashboard" className="btn-primary flex-1 justify-center text-sm">
                进入控制台
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost flex-1 justify-center text-sm">
                  登录
                </Link>
                <Link href="/register" className="btn-primary flex-1 justify-center text-sm">
                  免费试用
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
