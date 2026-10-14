"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { useAuthStore } from "@/stores/authStore";
import type { DeletionStatus } from "@/types";
import { DELETION_CHANGED_EVENT } from "@/components/profile/AccountLifecycleSettings";

/**
 * 注销倒计时横幅（P1-7）。
 *
 * 冷静期内允许登录，登录后壳层持续显示「账户将于 X 天删除」与显式「撤销注销」；
 * **不在登录时自动取消** —— 撤销必须是用户的主动动作。设置页改状态后通过
 * `DELETION_CHANGED_EVENT` 广播，横幅立即刷新。
 */
export function DeletionBanner() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [deletion, setDeletion] = useState<DeletionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setDeletion(null);
      return;
    }
    try {
      const s = await api<DeletionStatus>("/api/v1/users/me/deletion");
      setDeletion(s.scheduled ? s : null);
    } catch {
      /* fail-open：拿不到状态就不显示横幅 */
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener(DELETION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DELETION_CHANGED_EVENT, handler);
  }, [load]);

  async function cancel() {
    setBusy(true);
    try {
      await api("/api/v1/users/me/deletion", { method: "DELETE" });
      setDeletion(null);
      toast.success("已撤销注销");
    } catch (err) {
      toastApiError(err, "撤销失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  if (!deletion?.scheduled) return null;

  return (
    <div className="flex items-center gap-3 border-b border-error/20 bg-red-soft px-4 py-2 text-copy">
      <AlertTriangle size={15} className="text-error flex-shrink-0" />
      <span className="text-ink min-w-0">
        账户将于 <span className="font-semibold">{deletion.days_remaining}</span> 天后删除
      </span>
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="ml-auto flex-shrink-0 text-copy font-semibold text-brand-600 hover:text-brand-500 disabled:opacity-60 cursor-pointer"
      >
        {busy ? "撤销中…" : "撤销注销"}
      </button>
    </div>
  );
}
