"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MAIN_NAV, SECONDARY_NAV, navigationActive, type NavItem } from "@/lib/navigation";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const due = useVocabularyStore((s) => s.stats.due_count);
  const fetchStats = useVocabularyStore((s) => s.fetchStats);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("seeword-sidebar") === "collapsed");
    } catch {
      /* storage unavailable */
    }
  }, []);
  function renderNavLink(item: NavItem) {
    const active = navigationActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn("user-nav-link", active && "is-active")}
      >
        <item.icon size={18} className="shrink-0" />
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {item.href === "/vocabulary" && due > 0 && !collapsed && (
          <span className="inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-pill bg-brand-50 px-1 text-caption font-bold text-brand-700">
            {due}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside className={cn("user-sidebar", collapsed && "is-collapsed")} aria-label="主导航">
      <div className="user-sidebar-header flex min-h-20 items-center justify-between gap-1 px-2 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.03em] text-ink"
          aria-label="SeeWord 首页"
        >
          <Image src="/logo.png" alt="" width={26} height={26} />
          {!collapsed && <span>SeeWord</span>}
        </Link>
        <button
          type="button"
          aria-label={collapsed ? "展开导航" : "折叠导航"}
          aria-expanded={!collapsed}
          className="grid min-h-9 min-w-9 place-items-center rounded-sm text-muted hover:bg-surface-card"
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            try {
              localStorage.setItem("seeword-sidebar", next ? "collapsed" : "expanded");
            } catch {
              /* storage unavailable */
            }
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-1" aria-label="学习导航">
        {MAIN_NAV.map(renderNavLink)}
        <div className="my-1 border-t border-hairline" role="presentation" />
        {SECONDARY_NAV.map(renderNavLink)}
      </nav>
      <div className="shrink-0 border-t border-hairline pt-3 pb-3">
        <AccountMenu placement="sidebar" collapsed={collapsed} />
      </div>
    </aside>
  );
}
