"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Download, RefreshCw, Ticket } from "lucide-react";

import { SectionCard } from "@/components/admin/SectionCard";
import { Pagination } from "@/components/admin/Pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Badge } from "@/components/common/Badge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
      // Prepend on page 1; otherwise reload to surface the new batch.
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

  const actionMessage =
    action?.type === "revoke"
      ? "作废此未使用兑换码？作废后不可恢复，使用者将无法激活。"
      : action?.type === "refund"
        ? "退款撤销此已使用兑换码？将全额追回时长（扣减 duration_days，到期则降为 Free）。"
        : "";

  return (
    <div className="space-y-6">
      <SectionCard title="生成兑换码">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                数量
              </label>
              <Input
                type="number"
                value={codeCount}
                onChange={(e) => setCodeCount(Number(e.target.value))}
                min={1}
                max={500}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                有效期（天）
              </label>
              <Input
                type="number"
                value={codeDuration}
                onChange={(e) => setCodeDuration(Number(e.target.value))}
                min={1}
                max={3650}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                批次标签
              </label>
              <Input
                type="text"
                value={codeLabel}
                onChange={(e) => setCodeLabel(e.target.value)}
                placeholder="例: batch-2026Q1"
              />
            </div>
          </div>
          <Button type="submit" disabled={generating} icon={Ticket}>
            {generating ? "生成中..." : "生成兑换码"}
          </Button>
        </form>
      </SectionCard>

      <SectionCard
        title="兑换码列表"
        actions={
          <div className="flex gap-2">
            <Button
              onClick={reload}
              disabled={loading}
              variant="secondary"
              icon={RefreshCw}
              size="sm"
            >
              刷新
            </Button>
            <Button
              onClick={exportCsv}
              variant="secondary"
              icon={Download}
              size="sm"
            >
              导出 CSV
            </Button>
          </div>
        }
      >
        <DataTable
          columns={[
            { label: "兑换码" },
            { label: "方案" },
            { label: "有效期" },
            { label: "批次" },
            { label: "状态" },
            { label: "使用者" },
            { label: "操作" },
          ]}
          rows={codes}
          rowKey={(c) => c.id}
          loading={loading}
          emptyText="暂无兑换码"
          renderRow={(c) => (
            <tr className="text-xs">
              <td className="py-2 font-mono text-ink">{c.code}</td>
              <td className="py-2 text-muted-foreground">{c.plan}</td>
              <td className="py-2 text-muted-foreground">
                {c.duration_days}天
              </td>
              <td className="py-2 text-muted-foreground">
                {c.batch_label || "-"}
              </td>
              <td className="py-2">
                <Badge
                  tone={
                    c.status === "unused"
                      ? "green"
                      : c.status === "revoked"
                        ? "red"
                        : c.status === "expired"
                          ? "amber"
                          : "neutral"
                  }
                >
                  {c.status === "unused"
                    ? "可用"
                    : c.status === "redeemed"
                      ? "已使用"
                      : c.status === "revoked"
                        ? "已作废"
                        : "已过期"}
                </Badge>
              </td>
              <td className="py-2 text-muted-foreground font-mono">
                {c.used_by ? c.used_by.slice(0, 8) + "..." : "-"}
              </td>
              <td className="py-2">
                {c.status === "unused" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAction({ type: "revoke", code: c })}
                  >
                    作废
                  </Button>
                ) : c.status === "redeemed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAction({ type: "refund", code: c })}
                  >
                    退款撤销
                  </Button>
                ) : (
                  <span className="text-muted-soft">-</span>
                )}
              </td>
            </tr>
          )}
        />

        <Pagination
          page={page}
          hasMore={hasMore}
          loading={loading}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      </SectionCard>

      <ConfirmDialog
        open={action !== null}
        title={action?.type === "revoke" ? "作废兑换码" : "退款撤销"}
        message={actionMessage}
        confirmLabel={action?.type === "revoke" ? "作废" : "退款撤销"}
        tone="danger"
        busy={acting}
        onConfirm={confirmAction}
        onClose={() => {
          if (!acting) setAction(null);
        }}
      />
    </div>
  );
}
