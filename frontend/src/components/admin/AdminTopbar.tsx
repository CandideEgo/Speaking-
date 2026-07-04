"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, LogOut, ShieldCheck } from "lucide-react";
import { useAdminAuthStore } from "@/stores/adminAuthStore";
import { Badge } from "@/components/common/Badge";
import { getUgcPendingCount } from "@/lib/adminData";

const TITLES: Record<string, string> = {
  "/admin/videos": "视频内容",
  "/admin/community": "社区维护",
  "/admin/users": "用户管理",
  "/admin/orders": "订单管理",
  "/admin/stats": "数据统计",
  "/admin/invites": "兑换码",
};

export function AdminTopbar({ pathname }: { pathname: string }) {
  const logout = useAdminAuthStore((s) => s.logout);
  const authUser = useAdminAuthStore((s) => s.user);
  const [me, setMe] = useState<{ name?: string; email?: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Best-effort display name from the JWT; the shell already verified the role.
  useEffect(() => {
    if (authUser?.email) {
      setMe((prev) => prev ?? { email: authUser.email, name: authUser.name });
    }
  }, [authUser]);

  // UGC pending count (pending_processing + pending_review) — polled every 60s.
  // Surfaces UGC submissions awaiting admin action so they're not missed.
  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const data = await getUgcPendingCount();
        if (!cancelled) setPendingCount(data.total);
      } catch {
        /* silently fail — badge is best-effort */
      }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const title = TITLES[pathname] || "管理后台";
  const displayName = me?.name || me?.email || "管理员";

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-hairline bg-canvas px-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl font-medium text-ink">{title}</h1>
        {pendingCount > 0 && (
          <Link
            href="/admin/videos"
            className="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-100 transition-colors"
            title="待处理 UGC 视频"
          >
            <ClipboardList size={13} />
            待处理 {pendingCount}
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <ShieldCheck size={14} />
          </span>
          <span className="text-ink">{displayName}</span>
          <Badge tone="brand">管理员</Badge>
        </div>
        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-card hover:text-ink"
        >
          <LogOut size={13} /> 退出
        </button>
      </div>
    </header>
  );
}
