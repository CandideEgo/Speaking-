"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, History, Loader2, RotateCcw } from "lucide-react";

import { toastApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { SubtitleRevision } from "@/types";

/** Per-line subtitle edit history (collapsible) + rollback.
 *
 * Reads from the subtitle revisions endpoint (admin or owner — the parent
 * passes the right `onListRevisions`/`onRollback` callbacks). Rollback creates
 * a new revision, so we re-fetch the list after a successful rollback. */

const FIELD_LABELS: Record<string, string> = {
  text_en: "英文",
  text_zh: "中文",
  start_time: "开始",
  end_time: "结束",
  grammar_note: "语法点",
  speaker: "说话人",
  word_levels: "高亮",
};

function formatValue(field: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (field === "word_levels") return "(词级标注)";
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  if (typeof v === "number")
    return field.endsWith("time") ? `${v.toFixed(1)}s` : String(v);
  return String(v);
}

export function SubtitleHistory({
  subtitleId,
  onListRevisions,
  onRollback,
  onRolledBack,
}: {
  subtitleId: string;
  onListRevisions: (
    subId: string,
  ) => Promise<{ items: SubtitleRevision[]; has_more: boolean }>;
  onRollback: (subId: string, revisionId: string) => Promise<void>;
  onRolledBack?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [items, setItems] = useState<SubtitleRevision[]>([]);
  const [hasMore, setHasMore] = useState(false);

  const fetchRevisions = async () => {
    setLoading(true);
    try {
      const res = await onListRevisions(subtitleId);
      setItems(res.items);
      setHasMore(res.has_more);
    } catch (err) {
      toastApiError(err, "加载历史失败");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await fetchRevisions();
  };

  const handleRollback = async (revisionId: string) => {
    if (!confirm("回滚到此版本？当前内容会被覆盖（会再生成一条修订记录）。"))
      return;
    setRollingBackId(revisionId);
    try {
      await onRollback(subtitleId, revisionId);
      toast.success("已回滚");
      onRolledBack?.();
      await fetchRevisions();
    } catch (err) {
      toastApiError(err, "回滚失败");
    } finally {
      setRollingBackId(null);
    }
  };

  return (
    <div className="border-t border-hairline pt-2 mt-2">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 text-[11px] text-muted hover:text-ink transition-colors"
      >
        <History size={12} />
        修订历史
        {items.length > 0 && (
          <span className="text-muted">({items.length})</span>
        )}
        <ChevronDown
          size={12}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="mt-2 space-y-2 max-h-[200px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <Loader2 size={12} className="animate-spin" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <p className="text-[11px] text-muted">暂无修订记录。</p>
          ) : (
            items.map((rev) => (
              <div
                key={rev.id}
                className="text-[11px] bg-surface-soft rounded p-2"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-muted">
                    {new Date(rev.created_at).toLocaleString()}
                    {rev.scope && <span className="ml-1">· {rev.scope}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRollback(rev.id)}
                    disabled={rollingBackId === rev.id}
                    className="inline-flex items-center gap-1 text-brand-500 hover:underline disabled:opacity-50"
                    title="回滚到此版本"
                  >
                    {rollingBackId === rev.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <RotateCcw size={11} />
                    )}
                    回滚
                  </button>
                </div>
                <div className="space-y-0.5">
                  {Object.keys(rev.after).map((field) => (
                    <div key={field} className="flex gap-1 flex-wrap">
                      <span className="text-muted shrink-0">
                        {FIELD_LABELS[field] ?? field}:
                      </span>
                      <span className="line-through text-muted">
                        {formatValue(field, rev.before[field])}
                      </span>
                      <span className="text-muted">→</span>
                      <span className="text-ink">
                        {formatValue(field, rev.after[field])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          {hasMore && !loading && items.length > 0 && (
            <p className="text-[11px] text-muted">仅显示最近 50 条。</p>
          )}
        </div>
      )}
    </div>
  );
}
