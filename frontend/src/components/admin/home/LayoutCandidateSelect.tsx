"use client";

/**
 * 首页编排里的「内容版本选择器」与选中后的摘要（契约 §7.2）。
 *
 * 抽出来的理由：主推、次推、换个说法、今天就能用四个位置用的是**同一套**
 * 候选池与同一套禁用规则（来源失效 / 视频不可公共展示 / 同一视频已在其它
 * 位置），差别只在候选池大小与空值文案。之前这些规则和四个下拉框一起写在
 * 一个组件里，改一处禁用条件要同时改四处。
 */

import { Badge } from "@/components/common/Badge";
import { Select } from "@/components/ui/Select";
import type { HomeContentCandidate } from "@/types/homeContent";
import { POSITION_LABELS } from "./format";

export function candidateLabel(candidate: HomeContentCandidate): string {
  const parts = [candidate.headline || "（无标题）", candidate.video_title];
  if (candidate.topic_label) parts.push(candidate.topic_label);
  return parts.join(" · ");
}

/** 不可选原因；可选时返回 null。 */
export function candidateReason(candidate: HomeContentCandidate): string | null {
  if (candidate.source_changed) return "来源已变更";
  if (!candidate.publicly_visible) return "视频不可公共展示";
  return null;
}

/** 内容版本文本框（含失效原因与「已在其它位置」禁用）。 */
export function CandidateSelect({
  candidates,
  value,
  onChange,
  excludeVideoIds,
  emptyLabel,
}: {
  candidates: HomeContentCandidate[];
  value: string | null;
  onChange: (contentRevisionId: string | null) => void;
  excludeVideoIds: Set<string>;
  emptyLabel: string;
}) {
  const selected = candidates.find((candidate) => candidate.content_revision_id === value);
  const optionExists = Boolean(selected);
  return (
    <Select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {!optionExists && value && <option value={value}>（引用的内容版本已不在候选池）</option>}
      {candidates.map((candidate) => {
        const reason = candidateReason(candidate);
        const usedElsewhere =
          excludeVideoIds.has(candidate.video_id) && candidate.content_revision_id !== value;
        const suffix = reason
          ? `（${reason}，不可选）`
          : usedElsewhere
            ? "（同一视频已在其它位置）"
            : "";
        return (
          <option
            key={candidate.content_revision_id}
            value={candidate.content_revision_id}
            disabled={Boolean(reason) || usedElsewhere}
          >
            {candidateLabel(candidate)}
            {suffix}
          </option>
        );
      })}
    </Select>
  );
}

export function CandidateSummary({ candidate }: { candidate: HomeContentCandidate }) {
  const reason = candidateReason(candidate);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm bg-surface-soft px-3 py-2 text-caption text-muted">
      <span className="text-meta text-ink">{candidate.headline || "（无标题）"}</span>
      <span>{candidate.video_title}</span>
      {candidate.topic_label && <Badge tone="neutral">{candidate.topic_label}</Badge>}
      {candidate.positions.map((position) => (
        <Badge key={position} tone="brand">
          {POSITION_LABELS[position]}
        </Badge>
      ))}
      {reason && <Badge tone="amber">{reason}</Badge>}
    </div>
  );
}
