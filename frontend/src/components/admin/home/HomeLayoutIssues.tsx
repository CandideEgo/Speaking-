"use client";

/**
 * 字段级问题列表：布局/草稿发布被拒绝的原因逐条展示，不静默丢内容。
 * 公共契约见 `HomeLayoutIssue`（field 形如 `lead` / `secondary[0]` / `scenarios[1]`）。
 */

import { TriangleAlert } from "lucide-react";
import type { HomeLayoutIssue } from "@/types/homeContent";

const FIELD_LABELS: Record<string, string> = {
  lead: "主推",
  secondary: "次推",
  expression: "换个说法",
  scenarios: "今天就能用",
  headline: "编辑标题",
  dek: "推荐理由",
  topic_label: "主题标签",
  evidence_subtitle_ids: "标题依据句",
  clip: "片段",
  expressions: "表达",
  interaction: "互动",
};

function fieldLabel(field: string): string {
  const root = field.split(/[.[]/)[0] ?? field;
  return FIELD_LABELS[root] ?? field;
}

export function HomeLayoutIssues({
  issues,
  className,
}: {
  issues: HomeLayoutIssue[];
  className?: string;
}) {
  if (issues.length === 0) return null;
  return (
    <ul
      className={`space-y-1 rounded-sm border border-warning/40 bg-warning-soft px-3 py-2 ${className ?? ""}`}
      aria-label="字段级问题"
    >
      {issues.map((issue, index) => (
        <li
          key={`${issue.field}-${issue.code}-${index}`}
          className="flex items-start gap-1.5 text-caption text-warning-text"
        >
          <TriangleAlert size={12} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span>
            <span className="font-medium">{fieldLabel(issue.field)}</span>
            <span className="text-warning-text/80">（{issue.code}）</span>
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
