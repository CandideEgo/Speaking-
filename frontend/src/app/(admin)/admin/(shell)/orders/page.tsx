"use client";

import { RefreshCw } from "lucide-react";

import { SectionCard } from "@/components/admin/SectionCard";
import { Pagination } from "@/components/admin/Pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { AdminOrder } from "@/types";
import { listOrders } from "@/lib/adminData";

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

/** Amount is stored in fen (cents) — display as whole yuan to match the
 *  backend's recent-activity formatting (¥{amount/100:.0f}). */
function formatAmount(fen: number): string {
  return `¥${(fen / 100).toFixed(0)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

export default function AdminOrdersPage() {
  const {
    items: orders,
    page,
    setPage,
    hasMore,
    loading,
    reload,
  } = usePaginatedList<AdminOrder>({
    fetcher: (pg) => listOrders({ page: pg, page_size: 20 }),
    mode: "replace",
  });

  return (
    <SectionCard
      title="订单管理"
      description="查看所有 Pro 订单及支付状态。"
      actions={
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
      }
    >
      <DataTable
        columns={[
          { label: "订单号" },
          { label: "用户" },
          { label: "方案" },
          { label: "金额" },
          { label: "状态" },
          { label: "创建时间" },
          { label: "支付时间" },
        ]}
        rows={orders}
        rowKey={(o) => o.id}
        loading={loading}
        emptyText="暂无订单"
        renderRow={(o) => {
          const statusMeta = STATUS_LABEL[o.status] || {
            label: o.status,
            tone: "neutral" as BadgeTone,
          };
          return (
            <tr className="text-xs align-top">
              <td className="py-3 pr-4 font-mono text-ink">{o.order_number}</td>
              <td className="py-3 pr-4 text-muted-foreground truncate max-w-[180px]">
                {o.user_email || o.user_id.slice(0, 8)}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {PLAN_LABEL[o.plan] || o.plan}
              </td>
              <td className="py-3 pr-4 font-medium text-ink">
                {formatAmount(o.amount)}
              </td>
              <td className="py-3 pr-4">
                <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {formatDateTime(o.created_at)}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {formatDateTime(o.paid_at)}
              </td>
            </tr>
          );
        }}
      />

      <Pagination
        page={page}
        hasMore={hasMore}
        loading={loading}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </SectionCard>
  );
}
