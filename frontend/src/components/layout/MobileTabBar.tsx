"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import type { LucideIcon } from "lucide-react";
import { Sparkles, Compass, Mic, BookOpen, Users } from "lucide-react";

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
  showBadge?: boolean;
}

const TABS: TabItem[] = [
  { label: "首页", href: "/", icon: Sparkles },
  { label: "浏览", href: "/browse", icon: Compass },
  { label: "口语", href: "/speaking", icon: Mic },
  { label: "词汇", href: "/vocabulary", icon: BookOpen, showBadge: true },
  { label: "社区", href: "/community", icon: Users },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchStats = useVocabularyStore((s) => s.fetchStats);
  const dueCount = useVocabularyStore((s) => s.stats.due_count);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
    }
  }, [isAuthenticated, fetchStats]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline bg-canvas md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] transition-colors",
                active ? "text-brand-500" : "text-muted hover:text-ink",
              )}
            >
              <div className="relative">
                <tab.icon size={20} />
                {tab.showBadge && mounted && dueCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
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
