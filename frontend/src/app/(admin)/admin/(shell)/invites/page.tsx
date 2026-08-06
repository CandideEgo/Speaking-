"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Check, Copy, Download, Plus, RefreshCw, Ticket, Undo2, XCircle } from "lucide-react";

import {
  AdminPageHeader,
  AdminSkeleton,
  AdminConfirmDialog,
  AdminDropdown,
  AdminSearchInput,
} from "@/components/admin/ui";
import { StatChip } from "@/components/admin/StatChip";
import { FilterPills } from "@/components/admin/FilterPills";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import type { RedeemCode } from "@/types";
import {
  exportRedeemCsv,
  generateRedeemCodes,
  listRedeemCodes,
  redeemCodeSummary,
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
  unused: { label: "未使用", tone: "green" },
  redeemed: { label: "已兑换", tone: "neutral" },
  revoked: { label: "已作废", tone: "red" },
  expired: { label: "已过期", tone: "amber" },
};

const STATUS_FILTERS = [
  { key: "", label: "全部" },
  { key: "unused", label: "未使用" },
  { key: "redeemed", label: "已兑换" },
  { key: "revoked", label: "已作废" },
  { key: "expired", label: "已过期" },
];

const PLAN_OPTIONS = [
  { label: "Pro 月度（30 天）", days: 30 },
  { label: "Pro 季度（90 天）", days: 90 },
];

// ---------------------------------------------------------------------------
// Stat chip (prototype 30 .stat-chip)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminInvitesPage() {
  const [codeCount, setCodeCount] = useState(10);
  const [codeDuration, setCodeDuration] = useState(30);
  const [codeLabel, setCodeLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [lastGenerated, setLastGenerated] = useState<RedeemCode[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
    fetcher: (pg) =>
      listRedeemCodes({
        page: pg,
        page_size: PAGE_SIZE,
        status: (statusFilter || undefined) as RedeemCode["status"] | undefined,
        keyword,
      }),
    mode: "replace",
    filters: [statusFilter, keyword],
  });

  const refreshSummary = () => {
    redeemCodeSummary()
      .then(setSummary)
      .catch(() => undefined);
  };

  useEffect(() => {
    refreshSummary();
  }, []);

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
      setLastGenerated(generated);
      refreshSummary();
      if (page === 1 && !statusFilter && !keyword) {
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

  function copyCode(code: RedeemCode) {
    navigator.clipboard
      .writeText(code.code)
      .then(() => {
        setCopiedId(code.id);
        setTimeout(() => setCopiedId(null), 1000);
      })
      .catch(() => toast.error("复制失败"));
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
      refreshSummary();
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
        title="兑换码"
        description={`生成 · 导出 · 作废 Pro 会员兑换码 · 共 ${total} 个`}
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

      {/* Stat strip (prototype 30) */}
      <div className="flex flex-wrap gap-2.5">
        <StatChip
          value={summary.unused ?? 0}
          label="未使用"
          iconClass="bg-success-soft text-success"
        >
          <Check size={16} />
        </StatChip>
        <StatChip
          value={summary.redeemed ?? 0}
          label="已兑换"
          iconClass="bg-indigo-soft text-indigo"
        >
          <Ticket size={16} />
        </StatChip>
        <StatChip value={summary.revoked ?? 0} label="已作废" iconClass="bg-error/10 text-error">
          <XCircle size={16} />
        </StatChip>
        <StatChip
          value={summary.expired ?? 0}
          label="已过期"
          iconClass="bg-surface-card text-muted"
        >
          <Ticket size={16} />
        </StatChip>
      </div>

      {/* Generate + preview (prototype 30 .gen-grid) */}
      <div className="grid gap-[18px] lg:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-canvas p-5">
          <h3 className="mb-4 text-[15px] font-bold text-ink">批量生成</h3>
          <form onSubmit={handleGenerate} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-ink">生成数量</label>
              <input
                type="number"
                value={codeCount}
                onChange={(e) => setCodeCount(Number(e.target.value))}
                min={1}
                max={500}
                className="h-[38px] rounded-lg border border-hairline bg-canvas px-3 text-[13.5px] text-ink outline-none transition-all focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/12"
              />
              <span className="text-[11.5px] text-muted">单次最多 500 个</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-ink">套餐</label>
              <select
                value={codeDuration}
                onChange={(e) => setCodeDuration(Number(e.target.value))}
                className="h-[38px] cursor-pointer rounded-lg border border-hairline bg-canvas px-3 text-[13.5px] text-ink outline-none transition-all focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/12"
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p.days} value={p.days}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-ink">批次标签（可选）</label>
              <input
                type="text"
                value={codeLabel}
                onChange={(e) => setCodeLabel(e.target.value)}
                placeholder="例: batch-2026Q3"
                className="h-[38px] rounded-lg border border-hairline bg-canvas px-3 text-[13.5px] text-ink outline-none transition-all placeholder:text-muted-soft focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/12"
              />
            </div>
            <Button
              type="submit"
              disabled={generating}
              icon={Plus}
              className="self-start"
              size="sm"
            >
              {generating ? "生成中..." : "生成兑换码"}
            </Button>
          </form>
        </div>

        <div className="rounded-xl border border-hairline bg-canvas p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-ink">预览</h3>
            <span className="text-xs text-muted">格式 XXXX-XXXX-XX</span>
          </div>
          <div className="min-h-[60px] rounded-[10px] border border-dashed border-hairline bg-surface-soft p-3.5 font-mono text-[13px] text-body">
            {lastGenerated.length === 0 ? (
              <span className="text-muted-soft">生成后将在此显示新兑换码...</span>
            ) : (
              <>
                {lastGenerated.slice(0, 3).map((c) => (
                  <div key={c.id}>
                    <span className="font-semibold text-brand-600">{c.code}</span>{" "}
                    <span className="text-muted-soft">· Pro · {c.duration_days}天</span>
                  </div>
                ))}
                {lastGenerated.length > 3 && (
                  <div className="mt-1 text-muted-soft">… 共 {lastGenerated.length} 个</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar: search + filter */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterPills options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <AdminSearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索兑换码..."
          className="ml-auto w-72"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-hairline bg-canvas">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft/50">
              {["兑换码", "套餐", "状态", "使用人", "生成时间", "操作"].map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-[11.5px] font-bold uppercase tracking-wide text-muted ${
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
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted">
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
                      <span className="font-mono text-[13px] font-semibold text-brand-600">
                        {c.code}
                      </span>{" "}
                      <button
                        onClick={() => copyCode(c)}
                        className="rounded bg-surface-soft px-2 py-0.5 font-mono text-xs text-muted transition-colors hover:bg-brand-50 hover:text-brand-600"
                        title="复制"
                      >
                        {copiedId === c.id ? (
                          <Check size={12} className="inline text-success" />
                        ) : (
                          <>
                            <Copy size={11} className="mr-0.5 inline" />
                            复制
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-body">Pro · {c.duration_days} 天</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] text-muted">
                        {c.used_by ? c.used_by.slice(0, 8) + "..." : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">
                      {new Date(c.created_at).toLocaleDateString("zh-CN")}
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
