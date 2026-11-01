"use client";

/**
 * 首页编排的「当前位置总览」与状态格（契约 §7.2）。
 *
 * 线上（已发布布局）与草稿（正在编辑）分开显示，避免管理员靠编辑器里的
 * 下拉框猜「现在首页到底是谁」。这一段是纯展示，从编辑器组件里移出来，
 * 编辑器的状态机才不用和四行文案挤在一起。
 */

import type { HomeContentCandidate, HomeLayoutPlacement } from "@/types/homeContent";
import { POSITION_LABELS } from "./format";

export function StatusCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-surface-card px-4 py-3">
      <p className="text-caption font-medium uppercase tracking-wide text-muted-soft">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-ink">{children}</div>
    </div>
  );
}

export function revisionTitle(
  contentRevisionId: string,
  candidateById: Map<string, HomeContentCandidate>
): string {
  const candidate = candidateById.get(contentRevisionId);
  if (!candidate) return `（版本不可用：${contentRevisionId.slice(0, 8)}…）`;
  return candidate.headline || candidate.video_title;
}

/**
 * 四个首页位置的当前归属总览：线上（已发布布局）与草稿（正在编辑）分开显示。
 */
export function LayoutPositionSummary({
  published,
  draft,
  candidateById,
  publishedActive,
}: {
  published: HomeLayoutPlacement | null;
  draft: HomeLayoutPlacement;
  candidateById: Map<string, HomeContentCandidate>;
  publishedActive: boolean;
}) {
  function leadText(placement: HomeLayoutPlacement | null): string {
    if (!placement?.lead) return "—";
    return revisionTitle(placement.lead.content_revision_id, candidateById);
  }
  function secondaryText(placement: HomeLayoutPlacement | null): string {
    if (!placement || placement.secondary.length === 0) return "—";
    return placement.secondary
      .map((slot) => revisionTitle(slot.content_revision_id, candidateById))
      .join("；");
  }
  function expressionText(placement: HomeLayoutPlacement | null): string {
    if (!placement?.expression) return "—";
    const title = revisionTitle(placement.expression.content_revision_id, candidateById);
    return `${title} · ${placement.expression.expression_id || "（未选表达）"}`;
  }
  function scenariosText(placement: HomeLayoutPlacement | null): string {
    if (!placement || placement.scenarios.length === 0) return "—";
    return placement.scenarios
      .map(
        (slot) =>
          `${revisionTitle(slot.content_revision_id, candidateById)} · ${
            slot.scenario_id || "（未选场景）"
          }`
      )
      .join("；");
  }

  const rows = [
    { label: POSITION_LABELS.lead, published: leadText(published), draft: leadText(draft) },
    {
      label: POSITION_LABELS.secondary,
      published: secondaryText(published),
      draft: secondaryText(draft),
    },
    {
      label: POSITION_LABELS.expression,
      published: expressionText(published),
      draft: expressionText(draft),
    },
    {
      label: POSITION_LABELS.scenario,
      published: scenariosText(published),
      draft: scenariosText(draft),
    },
  ];

  return (
    <div className="rounded-md border border-hairline bg-surface-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <h2 className="text-copy font-semibold text-ink">当前位置总览</h2>
        <span className="text-caption text-muted">
          {publishedActive ? "线上：使用已发布编排" : "线上：旧首页兜底（未使用新编排）"}
        </span>
      </div>
      <ul className="divide-y divide-hairline">
        {rows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-1 gap-2 px-4 py-2.5 md:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <span className="text-meta font-medium text-ink">{row.label}</span>
            <div className="min-w-0">
              <p className="text-caption text-muted-soft">线上</p>
              <p className="break-words text-meta text-ink">{row.published}</p>
            </div>
            <div className="min-w-0">
              <p className="text-caption text-muted-soft">草稿</p>
              <p className="break-words text-meta text-muted">{row.draft}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
