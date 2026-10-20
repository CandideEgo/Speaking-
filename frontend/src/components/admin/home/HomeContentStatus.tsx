"use client";

/**
 * 视频详情「首页内容」的状态行：内容状态、首页位置、生成任务分开显示。
 * 只读服务端返回的状态，不在这里猜任何东西。
 */

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import type {
  HomeContentGeneration,
  HomeContentRevisionSummary,
  HomeContentVideoState,
} from "@/types/homeContent";
import { POSITION_LABELS, formatDateTime } from "./format";

function latestRevision(
  revisions: HomeContentRevisionSummary[]
): HomeContentRevisionSummary | null {
  return revisions.reduce<HomeContentRevisionSummary | null>(
    (latest, revision) =>
      latest === null || revision.version > latest.version ? revision : latest,
    null
  );
}

function StatusBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-surface-card px-4 py-3">
      <p className="text-caption font-medium uppercase tracking-wide text-muted-soft">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function GenerationStatus({ generation }: { generation: HomeContentGeneration | null }) {
  if (!generation || generation.status === "idle") {
    return <span className="text-meta text-muted">无进行中的生成任务</span>;
  }
  if (generation.status === "queued" || generation.status === "running") {
    return (
      <>
        <Loader2 size={13} className="animate-spin text-brand-500" aria-hidden />
        <Badge tone="brand">{generation.status === "queued" ? "排队中" : "生成中"}</Badge>
        <span className="text-caption text-muted">
          开始于 {formatDateTime(generation.started_at)}
        </span>
        {generation.coverage ? (
          <span className="text-caption text-muted">
            已提交 {generation.coverage.covered_sentences}/{generation.coverage.total_sentences}{" "}
            句字幕 · {generation.coverage.segments_sent}/{generation.coverage.planned_segments} 段
          </span>
        ) : null}
      </>
    );
  }
  if (generation.status === "succeeded") {
    return (
      <>
        <Badge tone="green">生成完成</Badge>
        <span className="text-caption text-muted">
          模型 {generation.model ?? "未记录"} · prompt {generation.prompt_version ?? "未记录"}
          {generation.finished_at ? ` · ${formatDateTime(generation.finished_at)}` : ""}
        </span>
        {generation.coverage ? (
          <span className="text-caption text-muted">
            {generation.coverage.is_full_coverage ? "已覆盖全文" : "字幕覆盖不完整"} ·{" "}
            {generation.coverage.covered_sentences}/{generation.coverage.total_sentences} 句 ·{" "}
            {generation.coverage.segments_sent}/{generation.coverage.planned_segments} 段
          </span>
        ) : null}
      </>
    );
  }
  return (
    <>
      <Badge tone="red">生成失败</Badge>
      <span className="text-caption text-muted">
        {generation.error_code ?? "UNKNOWN_ERROR"}
        {generation.error_message ? ` · ${generation.error_message}` : ""}
      </span>
      <span className="text-caption text-muted-soft">可点「重新生成」重试</span>
    </>
  );
}

export function HomeContentStatus({
  state,
  generation,
  generationActive,
}: {
  state: HomeContentVideoState;
  generation: HomeContentGeneration | null;
  generationActive: boolean;
}) {
  const published = latestRevision(state.revisions);
  const positions = state.positions.length
    ? state.positions.map((position) => POSITION_LABELS[position]).join("、")
    : "尚未编排";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatusBlock label="内容状态">
          {state.draft ? (
            <Badge tone="brand">草稿 rev {state.draft_revision}</Badge>
          ) : (
            <Badge tone="neutral">未制作</Badge>
          )}
          {published ? <Badge tone="green">已发布 v{published.version}</Badge> : null}
          {state.source_changed ? <Badge tone="amber">来源已变更</Badge> : null}
        </StatusBlock>
        <StatusBlock label="首页位置">
          <span className="text-meta text-ink">{positions}</span>
          {!state.publicly_visible && <Badge tone="amber">视频当前不满足公共展示条件</Badge>}
        </StatusBlock>
        <StatusBlock label="生成任务">
          <GenerationStatus generation={generation} />
        </StatusBlock>
      </div>
      {state.source_changed && (
        <p className="rounded-sm border border-warning/40 bg-warning-soft px-3 py-2 text-meta text-warning-text">
          当前字幕与草稿/已发布版本依据的字幕不一致：请重新核对引用后保存，或重新生成草稿。来源已变更的已发布版本在首页会被过滤。
        </p>
      )}
      {generationActive && (
        <p className="text-caption text-muted">
          生成任务进行中，完成后会自动刷新状态；可留在此页等待。
        </p>
      )}
    </div>
  );
}
