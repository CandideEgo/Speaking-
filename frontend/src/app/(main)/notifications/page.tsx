"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/EmptyState";
import { FullPageSpinner } from "@/components/common/Spinner";
import { TabPills } from "@/components/ui/TabPills";
import { Button } from "@/components/ui/Button";
import { relativeTime } from "@/lib/date";
import type { Paginated } from "@/types";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  related_url: string | null;
  created_at: string;
}

const TABS: { key: string; label: string; value: string | null }[] = [
  { key: "all", label: "全部", value: null },
  { key: "video", label: "视频", value: "video_ready" },
  { key: "pro", label: "会员", value: "pro_expiring" },
  { key: "vocab", label: "词汇", value: "vocabulary_reminder" },
  { key: "achievement", label: "成就", value: "achievement" },
];

/**
 * 通知列表（Phase 1 D6）—— 完整的通知中心页面。
 * - 类型筛选 (TabPills)
 * - 标记单条已读 + 跳转到 related_url
 * - 全部已读
 * - 滚动分页
 */
export default function NotificationsPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [type, setType] = useState<string | null>(null);

  const fetcher = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (type) params.set("type", type);
      return api<Paginated<Notification>>(`/api/v1/notifications?${params}`);
    },
    [type]
  );

  const { items, loading, hasMore, loaderRef, reload } = usePaginatedList<Notification>({
    fetcher,
    mode: "replace",
    enabled: isAuthenticated && !isLoading,
  });

  async function markRead(id: string, relatedUrl: string | null) {
    try {
      await api(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
      reload();
      if (relatedUrl) window.location.href = relatedUrl;
    } catch {
      toast.error("操作失败");
    }
  }

  async function markAllRead() {
    try {
      await api(`/api/v1/notifications/read-all`, { method: "PATCH" });
      reload();
      toast.success("已全部标记为已读");
    } catch {
      toast.error("操作失败");
    }
  }

  if (isLoading) return <FullPageSpinner />;

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-12 max-w-3xl">
        <PageHeader crumb="我的" title="通知" description="系统消息、学习提醒和成就通知都在这里" />

        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <TabPills
            tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
            activeKey={TABS.find((t) => t.value === type)?.key ?? "all"}
            onChange={(k) => setType(TABS.find((t) => t.key === k)?.value ?? null)}
          />
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            全部已读
          </Button>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-muted-soft border-t-ink rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="暂无通知"
            description="新视频、复习提醒和成就通知会出现在这里"
          />
        ) : (
          <>
            <div className="space-y-2">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={
                    "bg-canvas border border-hairline rounded-xl p-4 flex items-start gap-3 " +
                    (n.is_read ? "" : "border-brand-200")
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-ink truncate">{n.title}</h3>
                      <span className="text-[11px] text-muted-soft shrink-0">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                    {n.message && (
                      <p className="text-xs text-body leading-relaxed whitespace-pre-wrap">
                        {n.message}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      {n.related_url && (
                        <Link
                          href={n.related_url}
                          onClick={() => markRead(n.id, null)}
                          className="text-[11px] text-brand-500 hover:underline"
                        >
                          查看详情 →
                        </Link>
                      )}
                      {!n.is_read && (
                        <button
                          onClick={() => markRead(n.id, null)}
                          className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-1"
                        >
                          <Check size={11} />
                          标为已读
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {hasMore && (
              <div ref={loaderRef} className="flex justify-center py-6">
                <span className="text-xs text-muted-soft">加载更多…</span>
              </div>
            )}
          </>
        )}
      </main>
    </PageTransition>
  );
}
