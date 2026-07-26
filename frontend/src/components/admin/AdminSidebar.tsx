"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  CreditCard,
  Menu,
  Palette,
  Ticket,
  UserCog,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "内容",
    items: [{ label: "视频审核", href: "/admin/videos", icon: Video }],
  },
  {
    title: "运营",
    items: [
      { label: "用户管理", href: "/admin/users", icon: UserCog },
      { label: "订单管理", href: "/admin/orders", icon: CreditCard },
    ],
  },
  {
    title: "数据",
    items: [
      { label: "数据统计", href: "/admin/stats", icon: BarChart3 },
      { label: "兑换码", href: "/admin/invites", icon: Ticket },
    ],
  },
  {
    title: "系统",
    items: [{ label: "设计系统", href: "/admin/_design", icon: Palette }],
  },
];

function NavLinks({ pathname, onClick }: { pathname: string; onClick?: () => void }) {
  return (
    <>
      {NAV.map((section) => (
        <div key={section.title} className="mb-5">
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-soft">
            {section.title}
          </div>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClick}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-ink text-canvas"
                      : "text-muted hover:bg-surface-card hover:text-ink"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger button — visible below md */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg bg-canvas border border-hairline shadow-sm"
        aria-label="打开导航"
      >
        <Menu className="h-5 w-5 text-ink" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-canvas border-r border-hairline transform transition-transform duration-300 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-hairline px-5">
          <div className="leading-tight">
            <div className="text-[15px] font-display font-bold text-ink">SeeWord</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-soft">管理后台</div>
          </div>
          <button onClick={() => setMobileOpen(false)} aria-label="关闭导航">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks pathname={pathname} onClick={() => setMobileOpen(false)} />
        </nav>
        <div className="border-t border-hairline p-3">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="block rounded-sm px-3 py-2 text-xs text-muted hover:text-ink"
          >
            ← 返回用户端
          </Link>
        </div>
      </aside>

      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex h-full w-60 flex-shrink-0 flex-col border-r border-hairline bg-canvas">
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 border-b border-hairline px-5">
          <div className="leading-tight">
            <div className="text-[15px] font-display font-bold text-ink">SeeWord</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-soft">管理后台</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks pathname={pathname} />
        </nav>

        <div className="border-t border-hairline p-3">
          <Link href="/" className="block rounded-sm px-3 py-2 text-xs text-muted hover:text-ink">
            ← 返回用户端
          </Link>
        </div>
      </aside>
    </>
  );
}
