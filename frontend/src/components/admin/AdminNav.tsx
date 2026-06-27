"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Video, Flag, UserCog, BarChart3, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "视频内容", href: "/admin/videos", icon: Video },
  { label: "社区维护", href: "/admin/community", icon: Flag },
  { label: "用户管理", href: "/admin/users", icon: UserCog },
  { label: "数据统计", href: "/admin/stats", icon: BarChart3 },
  { label: "兑换码", href: "/admin/invites", icon: Ticket },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex overflow-x-auto rounded-md border border-hairline bg-canvas p-0.5">
      {ITEMS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-coral text-white"
                : "text-muted-foreground hover:text-ink",
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
