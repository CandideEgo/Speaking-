"use client";

import { RefreshCw, Download } from "lucide-react";

import { AdminPageHeader, AdminSkeleton } from "@/components/admin/ui";
import { Pagination } from "@/components/admin/Pagination";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { AdminOrder } from "@/types";
import { listOrders } from "@/lib/adminData";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: "已支付", tone: "green" },
  pending: { label: "待支付", tone: "amber" },
  expired: { label: "已过期", tone: "neutral" },
  cancelled: { label: "已取消", tone: "red" },
};

const PLAN_LABEL: Record<string, string> = {
  pro_monthly: "Pro 月度",
  pro_annual: "Pro 年度",
};

function formatAmount(fen: number): string {
  return `¥${(fen / 100).toFixed(0)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminOrdersPage() {
  const {
    items: orders,
    page,
    setPage,
    hasMore,
    total,
    loading,
    reload,
  } = usePaginatedList<AdminOrder>({
    fetcher: (pg) => listOrders({ page: pg, page_size: 20 }),
    mode: "replace",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="订单管理"
        description={`共 ${total} 笔订单`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={Download}>
              导出
            </Button>
            <Button
              onClick={reload}
              disabled={loading}
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              className={loading ? "[&_svg]:animate-spin" : ""}
            >
              刷新
            </Button>
          </div>
        }
      />

      {/* Table */}
      <div className="rounded-xl border border-hairline bg-canvas overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                订单号
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                用户
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                方案
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted">
                金额
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                状态
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                创建时间
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                支付时间
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {loading ? (
              <AdminSkeleton.TableRows rows={5} cols={7} />
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted">
                  暂无订单
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const statusMeta = STATUS_LABEL[o.status] || {
                  label: o.status,
                  tone: "neutral" as BadgeTone,
                };
                return (
                  <tr key={o.id} className="transition-colors hover:bg-surface-soft/40">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-ink">{o.order_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-body">
                        {o.user_phone || o.user_id.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">{PLAN_LABEL[o.plan] || o.plan}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-ink">
                        {formatAmount(o.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">{formatDateTime(o.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">{formatDateTime(o.paid_at)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        hasMore={hasMore}
        loading={loading}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  );
}
