"use client";

/**
 * 历史发布版本列表：不可变版本只读展示，可「复制为草稿」再编辑。
 * 复制动作走管理员 `restore-draft` 接口，不会改动任何已发布版本。
 */

import { History, RotateCcw } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import type { HomeContentRevisionSummary } from "@/types/homeContent";
import { POSITION_LABELS, formatDateTime } from "./format";

export function HomeContentVersions({
  revisions,
  busy = false,
  onRestore,
}: {
  revisions: HomeContentRevisionSummary[];
  busy?: boolean;
  onRestore: (revision: HomeContentRevisionSummary) => void;
}) {
  if (revisions.length === 0) return null;

  return (
    <details className="rounded-md border border-hairline bg-surface-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-copy font-medium text-ink">
        <History size={14} className="text-muted" aria-hidden />
        历史发布版本
        <span className="text-meta text-muted">（{revisions.length}）</span>
      </summary>
      <ul className="divide-y divide-hairline border-t border-hairline">
        {revisions.map((revision) => (
          <li
            key={revision.id}
            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">v{revision.version}</Badge>
                <span className="min-w-0 truncate text-copy text-ink">
                  {revision.headline || "（无标题）"}
                </span>
                {revision.source_changed && <Badge tone="amber">来源已变更</Badge>}
              </div>
              {revision.dek && <p className="max-w-3xl text-meta text-muted">{revision.dek}</p>}
              <p className="text-caption text-muted">
                {revision.published_at
                  ? `发布于 ${formatDateTime(revision.published_at)}`
                  : "发布时间未知"}
                {revision.published_by_name ? ` · ${revision.published_by_name}` : ""}
              </p>
              <p className="text-caption text-muted-soft">
                位置：
                {revision.positions.length
                  ? revision.positions.map((position) => POSITION_LABELS[position]).join("、")
                  : "未编排"}
                {" · "}表达 {revision.expression_ids.length} · 场景 {revision.scenario_ids.length}
              </p>
            </div>
            <Button
              variant="outline"
              size="compact"
              icon={RotateCcw}
              disabled={busy}
              onClick={() => onRestore(revision)}
            >
              复制为草稿
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
