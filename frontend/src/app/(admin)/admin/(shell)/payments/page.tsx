"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudDownload,
  RefreshCw,
  RotateCcw,
  Wallet,
} from "lucide-react";

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSearchInput,
  AdminSkeleton,
} from "@/components/admin/ui";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { FilterPills } from "@/components/admin/FilterPills";
import { Pagination } from "@/components/admin/Pagination";
import { StatChip } from "@/components/admin/StatChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { listPayments, paymentSummary, syncPayments } from "@/lib/adminData";
import { toastApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { AdminPayment, AdminPaymentStatus, AdminPaymentSummary } from "@/types";

// ---------------------------------------------------------------------------
// Status metadata / filters
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { key: "", label: "全部" },
  { key: "applied", label: "已发放" },
  { key: "pending", label: "待补发" },
  { key: "ignored", label: "待人工" },
  { key: "refunded", label: "已退款" },
  { key: "error", label: "异常" },
];

const STATUS_META: Record<AdminPaymentStatus, { label: string; tone: BadgeTone }> = {
  applied: { label: "已发放", tone: "green" },
  pending: { label: "待补发", tone: "amber" },
  ignored: { label: "待人工", tone: "amber" },
  refunded: { label: "已退款", tone: "neutral" },
  error: { label: "异常", tone: "red" },
};

const COLUMNS = [
  ["时间", "text-left"],
  ["用户", "text-left"],
  ["档位", "text-left"],
  ["金额", "text-right"],
  ["状态", "text-left"],
  ["交易号", "text-left"],
  ["发放时间", "text-left"],
] as const;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** 分 → ¥ 金额（整数不带角分，非整数保留两位）。 */
function formatFen(fen: number | null): string {
  if (fen === null) return "—";
  return `¥${(fen / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function PaymentRow({ payment: p }: { payment: AdminPayment }) {
  const meta = STATUS_META[p.status] ?? { label: p.status, tone: "neutral" as BadgeTone };
  return (
    <tr className="transition-colors hover:bg-surface-soft/40">
      <td className="whitespace-nowrap px-4 py-3">
        <p className="text-body">{formatDateTime(p.entry_created_at ?? p.created_at)}</p>
        <p className="text-meta text-muted">#{p.serial_number}</p>
      </td>
      <td className="px-4 py-3">
        <p className="max-w-[160px] truncate font-medium text-ink">
          {p.user_name || (p.user_id ? "未命名用户" : "未绑定账号")}
        </p>
        <p className="font-mono text-meta text-muted">{p.phone || "—"}</p>
        {p.user_id === null && p.status === "pending" && (
          <p className="text-meta text-warning-text">待注册后补发</p>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="text-body">{p.tier_name || "—"}</span>
        {p.duration_days ? (
          <span className="text-meta text-muted"> · {p.duration_days} 天</span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-body">
        {formatFen(p.amount_fen)}
      </td>
      <td className="px-4 py-3">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {p.error_message && (
          <p
            className="mt-1 max-w-[200px] truncate text-meta text-error-text"
            title={p.error_message}
          >
            {p.error_message}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-meta text-body">{p.trade_no || "—"}</span>
        {p.payment_method && <p className="text-meta text-muted">{p.payment_method}</p>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-meta text-muted">
        {formatDateTime(p.applied_at)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPaymentsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [summary, setSummary] = useState<AdminPaymentSummary | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await paymentSummary());
    } catch {
      /* 列表区域已有错误态与重试；摘要失败时不额外弹 toast */
    }
  }, []);

  const {
    items: payments,
    page,
    setPage,
    hasMore,
    total,
    loading,
    error,
    reload,
  } = usePaginatedList<AdminPayment>({
    fetcher: (pg) =>
      listPayments({
        page: pg,
        page_size: 20,
        status: statusFilter,
        keyword,
      }),
    mode: "replace",
    filters: [statusFilter, keyword],
  });

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const refreshAll = useCallback(() => {
    reload();
    loadSummary();
  }, [reload, loadSummary]);

  async function handleSync() {
    setSyncing(true);
    try {
      const { queued } = await syncPayments();
      if (queued) {
        toast.success("已提交同步任务，稍后刷新查看结果");
        refreshAll();
      } else {
        toast.info("金数据收款未启用或未配置，暂时无法同步");
      }
    } catch (err) {
      toastApiError(err, "同步收款失败");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="付费记录"
        description={`共 ${total} 条金数据付款记录 · 只读，退款请在金数据侧处理`}
        actions={
          <>
            <Button
              onClick={handleSync}
              disabled={syncing}
              variant="secondary"
              size="sm"
              icon={CloudDownload}
              className={syncing ? "[&_svg]:animate-pulse" : ""}
            >
              {syncing ? "同步中..." : "同步收款"}
            </Button>
            <Button
              onClick={refreshAll}
              disabled={loading}
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              className={loading ? "[&_svg]:animate-spin" : ""}
            >
              刷新
            </Button>
          </>
        }
      />

      {/* Stat chips (summary) */}
      <div className="flex flex-wrap items-center gap-2.5">
        <StatChip
          icon={CheckCircle2}
          value={summary ? summary.applied : "—"}
          label="已发放"
          iconClass="bg-success-soft text-success"
        />
        <StatChip
          icon={Clock}
          value={summary ? summary.pending : "—"}
          label="待补发"
          iconClass="bg-warning-soft text-warning"
        />
        <StatChip
          icon={AlertTriangle}
          value={summary ? summary.ignored : "—"}
          label="待人工"
          iconClass="bg-warning-soft text-warning"
        />
        <StatChip
          icon={RotateCcw}
          value={summary ? summary.refunded : "—"}
          label="已退款"
          iconClass="bg-surface-soft text-muted"
        />
        <StatChip
          icon={Wallet}
          value={summary ? formatFen(summary.paid_total_fen) : "—"}
          label="累计收入"
          iconClass="bg-brand-50 text-brand-600"
        />
        {summary && (
          <p className="text-meta text-muted">
            近 30 天 {formatFen(summary.paid_30d_fen)} · 今日 {formatFen(summary.paid_today_fen)}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <FilterPills options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <div role="search" aria-label="搜索付款记录" className="ml-auto w-full sm:w-72">
          <AdminSearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索手机号 / 交易号 / 档位..."
          />
        </div>
      </div>

      {/* Table */}
      <Card padding={0} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-copy">
            <caption className="sr-only">金数据付款记录列表</caption>
            <thead>
              <tr className="border-b border-hairline bg-surface-soft/50">
                {COLUMNS.map(([label, align]) => (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-meta font-medium uppercase tracking-wider text-muted",
                      align
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading && payments.length === 0 ? (
                <AdminSkeleton.TableRows rows={6} cols={COLUMNS.length} />
              ) : error && payments.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-2">
                    <AdminEmptyState
                      text="加载付款记录失败"
                      description="无法获取金数据付款数据，请检查网络后重试"
                      action={
                        <Button onClick={refreshAll} variant="secondary" size="sm" icon={RefreshCw}>
                          重试
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-2">
                    <AdminEmptyState
                      text="暂无付款记录"
                      description="金数据收款页成交后，已付款记录会出现在这里；同步任务每 5 分钟自动补漏。"
                    />
                  </td>
                </tr>
              ) : (
                payments.map((payment) => <PaymentRow key={payment.id} payment={payment} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
