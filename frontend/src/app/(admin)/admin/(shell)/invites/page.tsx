"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw, Ticket } from "lucide-react";

import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/admin/SectionCard";
import type { InviteCode } from "@/types";
import {
  exportInviteCsv,
  generateInviteCodes,
  listInviteCodes,
} from "@/lib/adminData";

export default function AdminInvitesPage() {
  const [codeCount, setCodeCount] = useState(10);
  const [codeDuration, setCodeDuration] = useState(30);
  const [codeLabel, setCodeLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);

  const loadCodes = useCallback(async () => {
    setLoadingCodes(true);
    try {
      const data = await listInviteCodes({ page: 1, page_size: 100 });
      setCodes(data.items);
    } catch {
      toast.error("加载兑换码失败");
    } finally {
      setLoadingCodes(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      const generated = await generateInviteCodes({
        count: codeCount,
        plan: "pro",
        duration_days: codeDuration,
        batch_label: codeLabel || undefined,
      });
      toast.success(`已生成 ${generated.length} 个兑换码`);
      setCodes((prev) => [...generated, ...prev]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function exportCsv() {
    try {
      const data = await exportInviteCsv();
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invite-codes-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${data.total} 个兑换码`);
    } catch {
      toast.error("导出失败");
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="生成兑换码">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                数量
              </label>
              <input
                type="number"
                value={codeCount}
                onChange={(e) => setCodeCount(Number(e.target.value))}
                min={1}
                max={500}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                有效期（天）
              </label>
              <input
                type="number"
                value={codeDuration}
                onChange={(e) => setCodeDuration(Number(e.target.value))}
                min={1}
                max={3650}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                批次标签
              </label>
              <input
                type="text"
                value={codeLabel}
                onChange={(e) => setCodeLabel(e.target.value)}
                placeholder="例: batch-2026Q1"
                className="input-field"
              />
            </div>
          </div>
          <button type="submit" disabled={generating} className="btn-primary">
            <Ticket size={16} />
            {generating ? "生成中..." : "生成兑换码"}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="兑换码列表"
        actions={
          <div className="flex gap-2">
            <button
              onClick={loadCodes}
              disabled={loadingCodes}
              className="btn-secondary !py-2 !px-3 text-xs"
            >
              <RefreshCw
                size={12}
                className={loadingCodes ? "animate-spin" : ""}
              />
              刷新
            </button>
            <button
              onClick={exportCsv}
              className="btn-secondary !py-2 !px-3 text-xs"
            >
              <Download size={12} />
              导出 CSV
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 font-medium">兑换码</th>
                <th className="pb-2 font-medium">方案</th>
                <th className="pb-2 font-medium">有效期</th>
                <th className="pb-2 font-medium">批次</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">使用者</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {codes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {loadingCodes ? "加载中..." : "暂无兑换码"}
                  </td>
                </tr>
              ) : (
                codes.map((c) => (
                  <tr key={c.id} className="text-xs">
                    <td className="py-2 font-mono text-ink">{c.code}</td>
                    <td className="py-2 text-muted-foreground">{c.plan}</td>
                    <td className="py-2 text-muted-foreground">
                      {c.duration_days}天
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {c.batch_label || "-"}
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-2 py-0.5 text-[10px] font-medium",
                          c.is_used
                            ? "bg-cream-soft text-muted-foreground"
                            : "bg-green-50 text-green-700",
                        )}
                      >
                        {c.is_used ? "已使用" : "可用"}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground font-mono">
                      {c.used_by ? c.used_by.slice(0, 8) + "..." : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
