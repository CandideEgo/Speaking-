"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";

const NAV_LINKS = [
  { label: "功能", href: "#features" },
  { label: "产品", href: "#showcase" },
  { label: "评价", href: "#testimonials" },
  { label: "价格", href: "#pricing" },
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
          <span className="text-[17px] font-display font-bold text-ink tracking-tight">
            SeeWord
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
            <LinkButton href="/" variant="primary" size="nav">
              进入应用
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" size="nav">
                登录
              </LinkButton>
              <LinkButton href="/register" variant="primary" size="nav">
                免费试用
              </LinkButton>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="菜单"
        >
          <Menu size={20} />
        </Button>
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
              <LinkButton href="/" variant="primary" fullWidth>
                进入应用
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/login" variant="ghost" fullWidth>
                  登录
                </LinkButton>
                <LinkButton href="/register" variant="primary" fullWidth>
                  免费试用
                </LinkButton>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
