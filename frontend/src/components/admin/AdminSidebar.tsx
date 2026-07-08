"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  Flag,
  Palette,
  Ticket,
  UserCog,
  Video,
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
      { label: "社区维护", href: "/admin/community", icon: Flag },
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

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex h-full w-60 flex-shrink-0 flex-col border-r border-hairline bg-canvas">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 border-b border-hairline px-5">
        <div className="leading-tight">
          <div className="text-[15px] font-display font-bold text-ink">
            SeeWord
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-soft">
            管理后台
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
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
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-ink text-on-primary"
                        : "text-olive hover:bg-surface-card hover:text-ink",
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
      </nav>

      <div className="border-t border-hairline p-3">
        <Link
          href="/"
          className="block rounded-sm px-3 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          ← 返回用户端
        </Link>
      </div>
    </aside>
  );
}
