"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Download, Plus, RefreshCw, Ticket, XCircle, Undo2 } from "lucide-react";

import {
  AdminPageHeader,
  AdminSkeleton,
  AdminConfirmDialog,
  AdminDropdown,
} from "@/components/admin/ui";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import type { RedeemCode } from "@/types";
import {
  exportRedeemCsv,
  generateRedeemCodes,
  listRedeemCodes,
  refundRedeemCode,
  revokeRedeemCode,
} from "@/lib/adminData";
import { usePaginatedList } from "@/hooks/usePaginatedList";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; tone: "green" | "red" | "amber" | "neutral" }
> = {
  unused: { label: "可用", tone: "green" },
  redeemed: { label: "已使用", tone: "neutral" },
  revoked: { label: "已作废", tone: "red" },
  expired: { label: "已过期", tone: "amber" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminInvitesPage() {
  const [codeCount, setCodeCount] = useState(10);
  const [codeDuration, setCodeDuration] = useState(30);
  const [codeLabel, setCodeLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [action, setAction] = useState<{
    type: "revoke" | "refund";
    code: RedeemCode;
  } | null>(null);
  const [acting, setActing] = useState(false);

  const {
    items: codes,
    setItems,
    page,
    setPage,
    hasMore,
    total,
    loading,
    reload,
  } = usePaginatedList<RedeemCode>({
    fetcher: (pg) => listRedeemCodes({ page: pg, page_size: PAGE_SIZE }),
    mode: "replace",
  });

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      const generated = await generateRedeemCodes({
        count: codeCount,
        plan: "pro",
        duration_days: codeDuration,
        batch_label: codeLabel || undefined,
      });
      toast.success(`已生成 ${generated.length} 个兑换码`);
      if (page === 1) {
        setItems((prev) => [...generated, ...prev]);
      } else {
        reload();
      }
    } catch (err) {
      toastApiError(err, "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function exportCsv() {
    try {
      const data = await exportRedeemCsv();
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `redeem-codes-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${data.total} 个兑换码`);
    } catch {
      toast.error("导出失败");
    }
  }

  async function confirmAction() {
    if (!action) return;
    setActing(true);
    try {
      if (action.type === "revoke") {
        await revokeRedeemCode(action.code.id, "error");
        toast.success("兑换码已作废");
      } else {
        const res = await refundRedeemCode(action.code.id);
        toast.success(`已退款撤销，用户方案：${res.plan}`);
      }
      reload();
      setAction(null);
    } catch (err) {
      toastApiError(err, "操作失败");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="兑换码管理"
        description={`共 ${total} 个兑换码`}
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={exportCsv} variant="secondary" size="sm" icon={Download}>
              导出 CSV
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

      {/* Generate Form */}
      <div className="rounded-xl border border-hairline bg-canvas p-5">
        <h3 className="text-sm font-semibold text-ink mb-4">生成兑换码</h3>
        <form onSubmit={handleGenerate}>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">数量</label>
              <input
                type="number"
                value={codeCount}
                onChange={(e) => setCodeCount(Number(e.target.value))}
                min={1}
                max={500}
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">有效期（天）</label>
              <input
                type="number"
                value={codeDuration}
                onChange={(e) => setCodeDuration(Number(e.target.value))}
                min={1}
                max={3650}
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">批次标签</label>
              <input
                type="text"
                value={codeLabel}
                onChange={(e) => setCodeLabel(e.target.value)}
                placeholder="例: batch-2026Q1"
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm placeholder:text-muted-soft focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={generating} icon={Plus} className="w-full">
                {generating ? "生成中..." : "生成"}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-hairline bg-canvas overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                兑换码
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                方案
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                有效期
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                批次
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                状态
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                使用者
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {loading ? (
              <AdminSkeleton.TableRows rows={5} cols={7} />
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted">
                  暂无兑换码
                </td>
              </tr>
            ) : (
              codes.map((c) => {
                const statusCfg = STATUS_CONFIG[c.status] || {
                  label: c.status,
                  tone: "neutral" as const,
                };
                return (
                  <tr key={c.id} className="transition-colors hover:bg-surface-soft/40">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-ink">{c.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted uppercase">{c.plan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">{c.duration_days} 天</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">{c.batch_label || "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted">
                        {c.used_by ? c.used_by.slice(0, 8) + "..." : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(c.status === "unused" || c.status === "redeemed") && (
                        <AdminDropdown
                          items={[
                            ...(c.status === "unused"
                              ? [
                                  {
                                    key: "revoke",
                                    label: "作废",
                                    icon: XCircle,
                                    danger: true,
                                    onClick: () => setAction({ type: "revoke", code: c }),
                                  },
                                ]
                              : []),
                            ...(c.status === "redeemed"
                              ? [
                                  {
                                    key: "refund",
                                    label: "退款撤销",
                                    icon: Undo2,
                                    danger: true,
                                    onClick: () => setAction({ type: "refund", code: c }),
                                  },
                                ]
                              : []),
                          ]}
                        />
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

      {/* Confirm Dialog */}
      <AdminConfirmDialog
        open={action !== null}
        onClose={() => {
          if (!acting) setAction(null);
        }}
        onConfirm={confirmAction}
        title={action?.type === "revoke" ? "作废兑换码" : "退款撤销"}
        description={
          action?.type === "revoke"
            ? "作废此未使用兑换码？作废后不可恢复，使用者将无法激活。"
            : "退款撤销此已使用兑换码？将全额追回时长（扣减 duration_days，到期则降为 Free）。"
        }
        confirmLabel={action?.type === "revoke" ? "作废" : "退款撤销"}
        danger
        loading={acting}
      />
    </div>
  );
}
