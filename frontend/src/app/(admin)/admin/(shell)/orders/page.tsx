"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, Info, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

import {
  AdminConfirmDialog,
  AdminPageHeader,
  AdminSearchInput,
  AdminSkeleton,
} from "@/components/admin/ui";
import { FilterPills } from "@/components/admin/FilterPills";
import { Pagination } from "@/components/admin/Pagination";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import { toastApiError } from "@/lib/errors";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { RedemptionRecord } from "@/types";
import { listRedemptions, redemptionSummary, refundRedeemCode } from "@/lib/adminData";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { key: "", label: "全部" },
  { key: "redeemed", label: "已兑换" },
  { key: "revoked", label: "已作废" },
  { key: "refunded", label: "已退款" },
];

function recordStatus(r: RedemptionRecord): { label: string; tone: BadgeTone } {
  if (r.status === "redeemed") return { label: "已兑换", tone: "green" };
  if (r.revoked_reason === "refund") return { label: "已退款", tone: "red" };
  return { label: "已作废", tone: "amber" };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Stat chip (prototype 29 .stat-chip)
// ---------------------------------------------------------------------------

function StatChip({
  icon: Icon,
  value,
  label,
  iconClass,
}: {
  icon: typeof CheckCircle2;
  value: number;
  label: string;
  iconClass: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-xs">
      <div className={`flex h-[30px] w-[30px] items-center justify-center rounded ${iconClass}`}>
        <Icon size={16} />
      </div>
      <div>
        <div className="font-mono text-[17px] font-extrabold leading-tight text-ink">
          {value.toLocaleString()}
        </div>
        <div className="text-muted">{label}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [summary, setSummary] = useState<{ redeemed: number; revoked: number; refunded: number }>({
    redeemed: 0,
    revoked: 0,
    refunded: 0,
  });
  const [refundTarget, setRefundTarget] = useState<RedemptionRecord | null>(null);
  const [refunding, setRefunding] = useState(false);

  const {
    items: records,
    page,
    setPage,
    hasMore,
    total,
    loading,
    reload,
  } = usePaginatedList<RedemptionRecord>({
    fetcher: (pg) =>
      listRedemptions({
        page: pg,
        page_size: 20,
        status: (statusFilter || undefined) as "redeemed" | "revoked" | "refunded" | undefined,
        keyword,
      }),
    mode: "replace",
    filters: [statusFilter, keyword],
  });

  useEffect(() => {
    redemptionSummary()
      .then(setSummary)
      .catch(() => undefined);
  }, [records.length]);

  async function confirmRefund() {
    if (!refundTarget) return;
    setRefunding(true);
    try {
      const res = await refundRedeemCode(refundTarget.id);
      toast.success(res.message || "已退款，Pro 时长已回收");
      setRefundTarget(null);
      reload();
      redemptionSummary()
        .then(setSummary)
        .catch(() => undefined);
    } catch (err) {
      toastApiError(err, "退款失败");
    } finally {
      setRefunding(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="订单管理"
        description={`兑换码兑换记录 · 退款 clawback · 状态追踪 · 共 ${total} 条`}
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
      />

      {/* Note (prototype 29 .note) */}
      <div className="flex items-start gap-2.5 rounded-[10px] border border-hairline bg-surface-soft px-3.5 py-3 text-[12.5px] text-muted">
        <Info size={16} className="mt-px shrink-0 text-brand-500" />
        <span>
          本站是非经营性平台，不提供站内支付。订单指
          <strong className="text-ink">兑换码激活记录</strong>
          ，退款即回收已兑换的 Pro 时长（clawback）。
        </span>
      </div>

      {/* Stat strip */}
      <div className="flex flex-wrap gap-2.5">
        <StatChip
          icon={CheckCircle2}
          value={summary.redeemed}
          label="已兑换"
          iconClass="bg-success-soft text-success"
        />
        <StatChip
          icon={Ban}
          value={summary.revoked}
          label="已作废"
          iconClass="bg-warning-soft text-warning"
        />
        <StatChip
          icon={Trash2}
          value={summary.refunded}
          label="已退款"
          iconClass="bg-error/10 text-error"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterPills options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <AdminSearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索兑换码、用户手机号..."
          className="ml-auto w-72"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-hairline bg-canvas">
        <table className="w-full min-w-[840px] text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft/50">
              {["兑换码", "用户", "套餐", "状态", "兑换时间", "操作"].map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted ${
                    i === 5 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {loading ? (
              <AdminSkeleton.TableRows rows={5} cols={6} />
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted">
                  暂无兑换记录
                </td>
              </tr>
            ) : (
              records.map((r) => {
                const st = recordStatus(r);
                return (
                  <tr key={r.id} className="transition-colors hover:bg-surface-soft/40">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[12.5px] font-semibold text-brand-600">
                        {r.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] text-body">{r.user_phone || "-"}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-body">Pro · {r.duration_days} 天</td>
                    <td className="px-4 py-3">
                      <Badge tone={st.tone}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {st.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">
                      {formatDateTime(r.used_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "redeemed" && (
                        <button
                          onClick={() => setRefundTarget(r)}
                          className="inline-flex h-[30px] items-center gap-1.5 rounded px-2.5 text-xs font-medium text-error transition-colors hover:bg-error/10"
                        >
                          <RotateCcw size={13} />
                          退款
                        </button>
                      )}
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

      {/* Refund confirm */}
      <AdminConfirmDialog
        open={refundTarget !== null}
        onClose={() => {
          if (!refunding) setRefundTarget(null);
        }}
        onConfirm={confirmRefund}
        title="退款 clawback"
        description={`确认对兑换码「${refundTarget?.code ?? ""}」执行退款？将回收 ${
          refundTarget?.duration_days ?? 0
        } 天 Pro 时长，到期则降为 Free。此操作不可撤销。`}
        confirmLabel="确认退款"
        danger
        loading={refunding}
      />
    </div>
  );
}
