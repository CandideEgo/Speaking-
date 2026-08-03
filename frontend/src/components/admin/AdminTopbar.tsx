"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  LogOut,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";
import { useAdminAuthStore } from "@/stores/adminAuthStore";
import { getUgcPendingCount } from "@/lib/adminData";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { AdminBreadcrumb, type BreadcrumbItem } from "./ui/AdminBreadcrumb";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Breadcrumb mapping
// ---------------------------------------------------------------------------

const BREADCRUMBS: Record<string, BreadcrumbItem[]> = {
  "/admin": [{ label: "仪表盘" }],
  "/admin/videos": [{ label: "视频管理" }],
  "/admin/users": [{ label: "用户管理" }],
  "/admin/orders": [{ label: "订单管理" }],
  "/admin/stats": [{ label: "数据统计" }],
  "/admin/invites": [{ label: "兑换码" }],
  "/admin/settings": [{ label: "系统设置" }],
};

// ---------------------------------------------------------------------------
// User dropdown
// ---------------------------------------------------------------------------

function UserMenu({ name }: { name: string }) {
  const logout = useAdminAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-soft transition-colors"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-medium text-xs">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:block text-ink font-medium">{name}</span>
        <ChevronDown
          size={14}
          className={cn("text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-hairline bg-canvas py-1 shadow-lg">
          <div className="border-b border-hairline px-3 py-2">
            <p className="text-sm font-medium text-ink">{name}</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              <ShieldCheck size={12} className="text-brand-500" />
              管理员
            </p>
          </div>
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-body hover:bg-surface-soft transition-colors"
          >
            <ExternalLink size={15} />
            访问用户端
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors"
          >
            <LogOut size={15} />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminTopbar() {
  const pathname = usePathname();
  const authUser = useAdminAuthStore((s) => s.user);
  const [pendingCount, setPendingCount] = useState(0);

  // UGC pending count polling — pauses while the tab is hidden.
  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const data = await getUgcPendingCount();
        if (!cancelled) setPendingCount(data.total);
      } catch {
        /* silently fail */
      }
    }
    fetchCount();
    return () => {
      cancelled = true;
    };
  }, []);

  useVisibilityAwareInterval(async () => {
    try {
      const data = await getUgcPendingCount();
      setPendingCount(data.total);
    } catch {
      /* silently fail */
    }
  }, 60000);

  const breadcrumbs = BREADCRUMBS[pathname] ?? [{ label: "管理后台" }];
  const displayName = authUser?.name || "管理员";

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-hairline bg-canvas px-6">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-4">
        <AdminBreadcrumb items={breadcrumbs} />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Pending badge */}
        {pendingCount > 0 && (
          <Link
            href="/admin/videos"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 transition-colors"
            title="待处理 UGC 视频"
          >
            <ClipboardList size={14} />
            <span className="hidden sm:inline">待处理</span>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] text-white">
              {pendingCount}
            </span>
          </Link>
        )}

        {/* Notification bell (placeholder) */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-soft hover:text-ink transition-colors">
          <Bell size={18} />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-hairline" />

        {/* User menu */}
        <UserMenu name={displayName} />
      </div>
    </header>
  );
}
