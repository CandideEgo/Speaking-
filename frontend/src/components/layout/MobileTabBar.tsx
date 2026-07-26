"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import type { LucideIcon } from "lucide-react";
import { Sparkles, Compass, BookOpen, User, History, Settings, Crown, LogOut } from "lucide-react";

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
  showBadge?: boolean;
  isMenu?: boolean;
}

const TABS: TabItem[] = [
  { label: "首页", href: "/", icon: Sparkles },
  { label: "发现", href: "/browse", icon: Compass },
  { label: "词汇", href: "/vocabulary", icon: BookOpen, showBadge: true },
  { label: "我的", href: "#", icon: User, isMenu: true },
];

const MENU_ITEMS = [
  { label: "学习记录", icon: History, href: "/history" },
  { label: "个人设置", icon: Settings, href: "/profile" },
  { label: "Pro 会员", icon: Crown, href: "/pricing" },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const fetchStats = useVocabularyStore((s) => s.fetchStats);
  const dueCount = useVocabularyStore((s) => s.stats.due_count);
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
    }
  }, [isAuthenticated, fetchStats]);

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // Close menu on route change
  useEffect(() => {
    setShowMenu(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline bg-canvas md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Popover menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 right-0 mx-4 mb-2 rounded-lg border border-hairline bg-canvas shadow-lift py-1.5 animate-fade-in"
        >
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setShowMenu(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-body hover:bg-surface-card hover:text-ink transition-colors"
            >
              <item.icon size={17} className="text-muted" />
              {item.label}
            </Link>
          ))}
          <div className="border-t border-hairline mt-1 pt-1">
            <button
              onClick={() => {
                setShowMenu(false);
                logout();
              }}
              className="flex items-center gap-3 px-4 py-3 text-sm text-muted hover:bg-surface-card hover:text-error transition-colors w-full"
            >
              <LogOut size={17} />
              退出登录
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-around">
        {TABS.map((tab) => {
          const active = tab.isMenu ? showMenu : isActive(tab.href);
          return tab.isMenu ? (
            <button
              key={tab.label}
              onClick={(e) => {
                e.preventDefault();
                setShowMenu((v) => !v);
              }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] transition-colors",
                active ? "text-brand-500" : "text-muted hover:text-ink"
              )}
            >
              <tab.icon size={20} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ) : (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] transition-colors",
                active ? "text-brand-500" : "text-muted hover:text-ink"
              )}
            >
              <div className="relative">
                <tab.icon size={20} />
                {tab.showBadge && mounted && dueCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-error text-on-primary text-[9px] font-bold leading-none">
                    {dueCount > 99 ? "99+" : dueCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
