"use client";

/**
 * 首页编排编辑器（`/admin/home-editorial`，契约 §7.2）。
 *
 * 内容与位置分离：这里只挑「已发布且来源有效」的内容版本，把它们放到
 * 主推 1 / 次推 ≤2 / 换个说法 1 / 今天就能用 ≤3。写操作全部带 expected_revision；
 * 发布前展示字段级 issues，发布/回滚都是服务端原子操作。
 *
 * 旧「首页展示」开关是精选候选池，与这里的主推位置无关——页面上明确说明。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  Trash2,
  Eye,
  LayoutTemplate,
} from "lucide-react";
import { apiErrorMessage, toastApiError } from "@/lib/errors";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import {
  emptyLayout,
  getHomeLayout,
  getHomeLayoutPreview,
  isRevisionConflictError,
  publishHomeLayout,
  rollbackHomeLayout,
  saveHomeLayoutDraft,
  REVISION_CONFLICT_MESSAGE,
} from "@/lib/adminHomeContent";
import type {
  HomeContentCandidate,
  HomeLayoutPlacement,
  HomeLayoutPreview,
  HomeLayoutState,
} from "@/types/homeContent";
import { HomeLayoutIssues } from "./HomeLayoutIssues";
import { HomePreviewDialog } from "./HomePreviewDialog";
import { POSITION_LABELS, formatDateTime } from "./format";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  action: () => void;
}

function candidateLabel(candidate: HomeContentCandidate): string {
  const parts = [candidate.headline || "（无标题）", candidate.video_title];
  if (candidate.topic_label) parts.push(candidate.topic_label);
  return parts.join(" · ");
}

function candidateReason(candidate: HomeContentCandidate): string | null {
  if (candidate.source_changed) return "来源已变更";
  if (!candidate.publicly_visible) return "视频不可公共展示";
  return null;
}

/** 内容版本文本框（含失效原因与「已在其它位置」禁用）。 */
function CandidateSelect({
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

function CandidateSummary({ candidate }: { candidate: HomeContentCandidate }) {
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

function StatusCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-surface-card px-4 py-3">
      <p className="text-caption font-medium uppercase tracking-wide text-muted-soft">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-ink">{children}</div>
    </div>
  );
}

function revisionTitle(
  contentRevisionId: string,
  candidateById: Map<string, HomeContentCandidate>
): string {
  const candidate = candidateById.get(contentRevisionId);
  if (!candidate) return `（版本不可用：${contentRevisionId.slice(0, 8)}…）`;
  return candidate.headline || candidate.video_title;
}

/**
 * 四个首页位置的当前归属总览：线上（已发布布局）与草稿（正在编辑）分开显示，
 * 避免管理员靠编辑器里的下拉框猜「现在首页到底是谁」。
 */
function LayoutPositionSummary({
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

export function HomeLayoutEditor() {
  const [state, setState] = useState<HomeLayoutState | null>(null);
  const [placement, setPlacement] = useState<HomeLayoutPlacement>(() => emptyLayout());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [preview, setPreview] = useState<HomeLayoutPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const dirtyRef = useRef(false);

  const applyState = useCallback((next: HomeLayoutState, force = true) => {
    setState(next);
    if (force || !dirtyRef.current) {
      setPlacement(next.draft_layout ?? emptyLayout());
      dirtyRef.current = false;
      setDirty(false);
    }
  }, []);

  const loadState = useCallback(
    async (options: { silent?: boolean; force?: boolean } = {}) => {
      if (!options.silent) setLoading(true);
      setLoadError(null);
      try {
        const next = await getHomeLayout();
        applyState(next, options.force ?? true);
      } catch (err) {
        if (options.silent) toastApiError(err, "刷新首页编排失败");
        else setLoadError(apiErrorMessage(err, "加载首页编排失败"));
      } finally {
        if (!options.silent) setLoading(false);
      }
    },
    [applyState]
  );

  useEffect(() => {
    void loadState();
  }, [loadState]);

  function updatePlacement(updater: (current: HomeLayoutPlacement) => HomeLayoutPlacement) {
    setPlacement((current) => updater(current));
    dirtyRef.current = true;
    setDirty(true);
    setConflict(false);
  }

  const candidates = useMemo(() => state?.candidates ?? [], [state?.candidates]);
  const candidateById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.content_revision_id, candidate])),
    [candidates]
  );
  const expressionCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.expression_ids.length > 0),
    [candidates]
  );
  const scenarioCandidates = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.scenario_ids.length > 0 &&
          candidate.content_revision_id === placement.lead?.content_revision_id
      ),
    [candidates, placement.lead?.content_revision_id]
  );

  const leadCandidate = placement.lead
    ? candidateById.get(placement.lead.content_revision_id)
    : undefined;
  const leadVideoId = leadCandidate?.video_id ?? null;
  const secondaryVideoIds = placement.secondary
    .map((slot) => candidateById.get(slot.content_revision_id)?.video_id)
    .filter((videoId): videoId is string => Boolean(videoId));
  const leadExcludedVideoIds = new Set(secondaryVideoIds);

  function secondaryExcludedVideoIds(slotIndex: number): Set<string> {
    const excluded = new Set<string>();
    if (leadVideoId) excluded.add(leadVideoId);
    placement.secondary.forEach((slot, index) => {
      if (index === slotIndex) return;
      const videoId = candidateById.get(slot.content_revision_id)?.video_id;
      if (videoId) excluded.add(videoId);
    });
    return excluded;
  }

  const publishedLeadRevisionId = state?.published_layout?.lead?.content_revision_id ?? null;
  const publishedLeadCandidate = publishedLeadRevisionId
    ? candidateById.get(publishedLeadRevisionId)
    : undefined;

  // --- 次推 ---
  function addSecondary() {
    if (placement.secondary.length >= 2) return;
    updatePlacement((current) => ({
      ...current,
      secondary: [...current.secondary, { content_revision_id: "" }],
    }));
  }

  function removeSecondary(index: number) {
    updatePlacement((current) => ({
      ...current,
      secondary: current.secondary.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  function moveSecondary(index: number, direction: -1 | 1) {
    updatePlacement((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.secondary.length) return current;
      const next = [...current.secondary];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...current, secondary: next };
    });
  }

  function setSecondary(index: number, contentRevisionId: string | null) {
    if (!contentRevisionId) {
      removeSecondary(index);
      return;
    }
    updatePlacement((current) => ({
      ...current,
      secondary: current.secondary.map((slot, currentIndex) =>
        currentIndex === index ? { content_revision_id: contentRevisionId } : slot
      ),
    }));
  }

  // --- 换个说法 ---
  function setExpressionRevision(contentRevisionId: string | null) {
    const candidate = contentRevisionId ? candidateById.get(contentRevisionId) : undefined;
    if (!contentRevisionId || !candidate) {
      updatePlacement((current) => ({ ...current, expression: null }));
      return;
    }
    updatePlacement((current) => ({
      ...current,
      expression: {
        content_revision_id: contentRevisionId,
        expression_id: candidate.expression_ids[0] ?? "",
      },
    }));
  }

  function setExpressionId(expressionId: string) {
    updatePlacement((current) => {
      if (!current.expression) return current;
      return {
        ...current,
        expression: { ...current.expression, expression_id: expressionId },
      };
    });
  }

  // --- 今天就能用 ---
  function addScenarioSlot() {
    if (placement.scenarios.length >= 3) return;
    const candidate = scenarioCandidates[0];
    if (!candidate) return;
    updatePlacement((current) => ({
      ...current,
      scenarios: [
        ...current.scenarios,
        {
          content_revision_id: candidate.content_revision_id,
          scenario_id: candidate.scenario_ids[0] ?? "",
        },
      ],
    }));
  }

  function removeScenarioSlot(index: number) {
    updatePlacement((current) => ({
      ...current,
      scenarios: current.scenarios.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  function setScenarioRevision(index: number, contentRevisionId: string | null) {
    if (!contentRevisionId) {
      removeScenarioSlot(index);
      return;
    }
    const candidate = candidateById.get(contentRevisionId);
    updatePlacement((current) => ({
      ...current,
      scenarios: current.scenarios.map((slot, currentIndex) =>
        currentIndex === index
          ? {
              content_revision_id: contentRevisionId,
              scenario_id: candidate?.scenario_ids[0] ?? "",
            }
          : slot
      ),
    }));
  }

  function setScenarioId(index: number, scenarioId: string) {
    updatePlacement((current) => ({
      ...current,
      scenarios: current.scenarios.map((slot, currentIndex) =>
        currentIndex === index ? { ...slot, scenario_id: scenarioId } : slot
      ),
    }));
  }

  // --- 保存 / 发布 / 回滚 ---
  const handleSave = useCallback(() => {
    if (!state) return;
    setSaving(true);
    setConflict(false);
    void (async () => {
      try {
        const next = await saveHomeLayoutDraft(placement, state.revision);
        applyState(next, true);
        toast.success("编排草稿已保存");
      } catch (err) {
        if (isRevisionConflictError(err)) {
          setConflict(true);
          toast.error(REVISION_CONFLICT_MESSAGE);
        } else {
          toastApiError(err, "保存编排草稿失败");
        }
      } finally {
        setSaving(false);
      }
    })();
  }, [state, placement, applyState]);

  const doPublish = useCallback(() => {
    if (!state) return;
    setPublishing(true);
    setConflict(false);
    void (async () => {
      try {
        const result = await publishHomeLayout(state.revision);
        toast.success(`首页编排已发布（layout revision ${result.layout_revision}）`);
        await loadState({ silent: true, force: true });
      } catch (err) {
        if (isRevisionConflictError(err)) {
          setConflict(true);
          toast.error(REVISION_CONFLICT_MESSAGE);
        } else {
          toastApiError(err, "发布首页编排失败");
        }
        void loadState({ silent: true, force: false });
      } finally {
        setPublishing(false);
      }
    })();
  }, [state, loadState]);

  const handlePublishClick = useCallback(() => {
    setConfirm({
      title: "发布首页编排",
      message:
        "将校验草稿布局并原子发布整版；引用失效、视频下线或字段缺失会被拒绝并在下方逐条列出。确认发布？",
      confirmLabel: "发布",
      action: () => doPublish(),
    });
  }, [doPublish]);

  const doRollback = useCallback(() => {
    if (!state) return;
    setRollingBack(true);
    setConflict(false);
    void (async () => {
      try {
        const result = await rollbackHomeLayout(state.revision);
        if (result.cleared) {
          toast.success("已撤下首页编排（回到旧版兜底）");
        } else {
          toast.success(`已恢复上一发布布局（layout revision ${result.layout_revision}）`);
        }
        await loadState({ silent: true, force: true });
      } catch (err) {
        if (isRevisionConflictError(err)) {
          setConflict(true);
          toast.error(REVISION_CONFLICT_MESSAGE);
        } else {
          toastApiError(err, "恢复上一版失败");
        }
        void loadState({ silent: true, force: false });
      } finally {
        setRollingBack(false);
      }
    })();
  }, [state, loadState]);

  const handleRollbackClick = useCallback(() => {
    const hasPrevious = state?.previous_published_layout != null;
    setConfirm({
      title: hasPrevious ? "恢复上一发布布局" : "撤下当前编排",
      message: hasPrevious
        ? "将把首页恢复到上一发布布局，服务端会重新校验视频可见性与来源；上一版已不可恢复时会拒绝并说明原因。确认？"
        : "当前编排没有更早的发布记录。确认后将撤下当前编排，首页回到旧版精选兜底（旧 featured 流程）；服务端会重新校验，失败时说明原因。确认？",
      confirmLabel: hasPrevious ? "恢复上一版" : "撤下当前编排",
      action: () => doRollback(),
    });
  }, [doRollback, state]);

  const handleRefresh = useCallback(() => {
    if (dirtyRef.current) {
      setConfirm({
        title: "刷新会丢弃未保存编辑",
        message: "当前编排有未保存的修改，刷新会从服务端重新加载。继续？",
        confirmLabel: "刷新",
        action: () => void loadState({ force: true }),
      });
      return;
    }
    void loadState({ force: true });
  }, [loadState]);

  const loadPreview = useCallback(() => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    void (async () => {
      try {
        setPreview(await getHomeLayoutPreview());
      } catch (err) {
        setPreviewError(apiErrorMessage(err, "预览加载失败"));
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, []);

  const busy = saving || publishing || rollingBack;
  const publishBlockedReason = !placement.lead
    ? "先选择主推内容版本再发布。"
    : dirty
      ? "先保存编排草稿，发布的是服务端保存的布局。"
      : state && state.issues.length > 0
        ? "草稿布局还有字段级问题，先处理后才能发布。"
        : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="首页编排"
        description="首页展示 1 个主推视频与该视频的场景。更换主推后场景自动跟随，次推只用于主推失效时递补。"
        actions={
          <>
            <Button
              variant="outline"
              size="compact"
              icon={RefreshCw}
              onClick={handleRefresh}
              disabled={loading || busy}
            >
              刷新
            </Button>
            <Button variant="outline" size="compact" icon={Eye} onClick={loadPreview}>
              整体预览
            </Button>
          </>
        }
      />

      <p className="rounded-sm bg-surface-soft px-3 py-2 text-caption text-muted">
        说明：视频详情里的「首页展示」是旧精选候选池开关，与这里的主推/次推位置无关；自动精选
        `is_featured` 也不参与新位置决策。
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-meta text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          正在加载首页编排…
        </div>
      ) : loadError ? (
        <div className="space-y-3 rounded-sm border border-error/40 bg-red-soft px-4 py-3">
          <p className="text-meta text-error-text">{loadError}</p>
          <Button variant="outline" size="compact" onClick={handleRefresh}>
            重新加载
          </Button>
        </div>
      ) : state ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <StatusCell label="草稿 revision">rev {state.revision}</StatusCell>
            <StatusCell label="已发布 revision">
              {state.published_revision === null ? "尚未发布" : `rev ${state.published_revision}`}
            </StatusCell>
            <StatusCell label="线上首页">
              {state.published_active ? (
                <Badge tone="green">使用新编排</Badge>
              ) : (
                <Badge tone="neutral">旧首页兜底</Badge>
              )}
              <span className="text-caption text-muted-soft">
                {state.published_active ? "首页展示已发布编排" : "未使用新编排（旧版精选兜底）"}
              </span>
            </StatusCell>
            <StatusCell label="最近更新">{formatDateTime(state.updated_at)}</StatusCell>
          </div>

          <p className="text-caption text-muted">
            当前首页：
            {state.published_active ? "使用已发布编排" : "旧版精选兜底（未使用新编排）"}
            {state.published_at ? ` · 编排发布于 ${formatDateTime(state.published_at)}` : ""}
          </p>

          {publishedLeadCandidate && state.published_active && (
            <p className="text-caption text-muted">
              当前线上主推：{publishedLeadCandidate.headline || publishedLeadCandidate.video_title}
            </p>
          )}

          <LayoutPositionSummary
            published={state.published_layout}
            draft={state.draft_layout}
            candidateById={candidateById}
            publishedActive={state.published_active}
          />

          {conflict && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-error/40 bg-red-soft px-3 py-2">
              <p className="text-meta text-error-text">{REVISION_CONFLICT_MESSAGE}</p>
              <Button variant="outline" size="compact" onClick={handleRefresh}>
                刷新
              </Button>
            </div>
          )}

          <HomeLayoutIssues issues={state.issues} />

          {candidates.length === 0 ? (
            <Card padding={5} className="space-y-2 text-center">
              <LayoutTemplate size={28} className="mx-auto text-muted-soft" aria-hidden />
              <p className="text-copy font-medium text-ink">还没有可编排的内容版本</p>
              <p className="text-meta text-muted">
                先到视频详情页的「首页内容」生成/编辑并发布内容版本，再回来编排。
              </p>
            </Card>
          ) : (
            <>
              <Card padding={5} className="space-y-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-copy font-semibold text-ink">主推（1 条）</h2>
                    <span className="text-caption text-muted">
                      无编排时使用普通精选，同样展示单视频卡
                    </span>
                  </div>
                  <CandidateSelect
                    candidates={candidates}
                    value={placement.lead?.content_revision_id ?? null}
                    excludeVideoIds={leadExcludedVideoIds}
                    emptyLabel="暂不设置主推"
                    onChange={(contentRevisionId) =>
                      updatePlacement((current) => ({
                        ...current,
                        lead: contentRevisionId ? { content_revision_id: contentRevisionId } : null,
                        scenarios: current.scenarios.filter(
                          (slot) => slot.content_revision_id === contentRevisionId
                        ),
                      }))
                    }
                  />
                  {leadCandidate && <CandidateSummary candidate={leadCandidate} />}
                </div>

                <div className="space-y-2 border-t border-hairline pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-copy font-semibold text-ink">次推（最多 2 条）</h2>
                    <Button
                      variant="outline"
                      size="compact"
                      icon={Plus}
                      disabled={placement.secondary.length >= 2 || busy}
                      onClick={addSecondary}
                    >
                      添加次推
                    </Button>
                  </div>
                  {placement.secondary.length === 0 ? (
                    <p className="text-meta text-muted">
                      未设置次推；主次视频不重复。次推只用于主推失效时递补，不在首页并排展示。
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {placement.secondary.map((slot, index) => (
                        <div
                          key={`secondary-${index}`}
                          className="flex flex-col gap-2 sm:flex-row sm:items-start"
                        >
                          <div className="min-w-0 flex-1">
                            <CandidateSelect
                              candidates={candidates}
                              value={slot.content_revision_id || null}
                              excludeVideoIds={secondaryExcludedVideoIds(index)}
                              emptyLabel="选择次推内容"
                              onChange={(contentRevisionId) =>
                                setSecondary(index, contentRevisionId)
                              }
                            />
                            {slot.content_revision_id &&
                              candidateById.get(slot.content_revision_id) && (
                                <CandidateSummary
                                  candidate={candidateById.get(slot.content_revision_id)!}
                                />
                              )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="outline"
                              size="compact"
                              icon={ArrowUp}
                              disabled={index === 0 || busy}
                              onClick={() => moveSecondary(index, -1)}
                              title="上移"
                            >
                              上移
                            </Button>
                            <Button
                              variant="outline"
                              size="compact"
                              icon={ArrowDown}
                              disabled={index === placement.secondary.length - 1 || busy}
                              onClick={() => moveSecondary(index, 1)}
                              title="下移"
                            >
                              下移
                            </Button>
                            <Button
                              variant="ghost"
                              size="compact"
                              icon={Trash2}
                              disabled={busy}
                              onClick={() => removeSecondary(index)}
                            >
                              移除
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-hairline pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-copy font-semibold text-ink">换个说法（最多 1 条）</h2>
                    {placement.expression && (
                      <Button
                        variant="ghost"
                        size="compact"
                        icon={Trash2}
                        disabled={busy}
                        onClick={() =>
                          updatePlacement((current) => ({ ...current, expression: null }))
                        }
                      >
                        移除
                      </Button>
                    )}
                  </div>
                  {placement.expression ? (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <CandidateSelect
                        candidates={expressionCandidates}
                        value={placement.expression.content_revision_id}
                        excludeVideoIds={new Set()}
                        emptyLabel="选择内容版本"
                        onChange={setExpressionRevision}
                      />
                      <Select
                        value={placement.expression.expression_id}
                        onChange={(event) => setExpressionId(event.target.value)}
                      >
                        {!candidateById
                          .get(placement.expression.content_revision_id)
                          ?.expression_ids.includes(placement.expression.expression_id) && (
                          <option value={placement.expression.expression_id}>
                            （引用的表达已不在该版本）
                          </option>
                        )}
                        {(
                          candidateById.get(placement.expression.content_revision_id)
                            ?.expression_ids ?? []
                        ).map((expressionId) => (
                          <option key={expressionId} value={expressionId}>
                            {expressionId}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="compact"
                      icon={Plus}
                      disabled={expressionCandidates.length === 0 || busy}
                      onClick={() =>
                        setExpressionRevision(expressionCandidates[0]?.content_revision_id ?? null)
                      }
                    >
                      选择表达卡
                    </Button>
                  )}
                  {expressionCandidates.length === 0 && (
                    <p className="text-caption text-muted">
                      还没有带表达（expressions）的已发布内容版本。
                    </p>
                  )}
                </div>

                <div className="space-y-2 border-t border-hairline pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-copy font-semibold text-ink">今天就能用（最多 3 条）</h2>
                    <Button
                      variant="outline"
                      size="compact"
                      icon={Plus}
                      disabled={
                        placement.scenarios.length >= 3 || scenarioCandidates.length === 0 || busy
                      }
                      onClick={addScenarioSlot}
                    >
                      添加场景
                    </Button>
                  </div>
                  {placement.scenarios.length === 0 ? (
                    <p className="text-meta text-muted">
                      默认跟随主推版本的关联场景；没有场景时使用本期视频的真实字幕练习。可选择该版本的场景调整顺序。
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {placement.scenarios.map((slot, index) => {
                        const candidate = candidateById.get(slot.content_revision_id);
                        return (
                          <div
                            key={`scenario-${index}`}
                            className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                          >
                            <CandidateSelect
                              candidates={scenarioCandidates}
                              value={slot.content_revision_id || null}
                              excludeVideoIds={new Set()}
                              emptyLabel="选择内容版本"
                              onChange={(contentRevisionId) =>
                                setScenarioRevision(index, contentRevisionId)
                              }
                            />
                            <Select
                              value={slot.scenario_id}
                              onChange={(event) => setScenarioId(index, event.target.value)}
                            >
                              {!candidate?.scenario_ids.includes(slot.scenario_id) && (
                                <option value={slot.scenario_id}>（引用的场景已不在该版本）</option>
                              )}
                              {(candidate?.scenario_ids ?? []).map((scenarioId) => (
                                <option key={scenarioId} value={scenarioId}>
                                  {scenarioId}
                                </option>
                              ))}
                            </Select>
                            <Button
                              variant="ghost"
                              size="compact"
                              icon={Trash2}
                              disabled={busy}
                              onClick={() => removeScenarioSlot(index)}
                            >
                              移除
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {scenarioCandidates.length === 0 && (
                    <p className="text-caption text-muted">
                      当前主推版本没有可选场景，可到该视频的首页内容草稿中编辑并发布。
                    </p>
                  )}
                </div>
              </Card>

              <Card padding={5} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    icon={saving ? Loader2 : Save}
                    disabled={!dirty || busy}
                    onClick={handleSave}
                  >
                    {saving ? "保存中…" : "保存编排草稿"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Rocket}
                    disabled={busy || Boolean(publishBlockedReason)}
                    onClick={handlePublishClick}
                  >
                    {publishing ? "发布中…" : "发布到首页"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={RotateCcw}
                    disabled={busy || !state.published_layout}
                    title={
                      state.published_layout
                        ? state.previous_published_layout
                          ? "恢复到上一发布布局"
                          : "撤下当前编排，首页回到旧版精选兜底"
                        : "当前没有已发布编排，无需恢复"
                    }
                    onClick={handleRollbackClick}
                  >
                    {rollingBack ? "恢复中…" : "恢复上一版"}
                  </Button>
                  <span className="text-caption text-muted">
                    {dirty ? "有未保存修改" : "与服务端一致"}
                  </span>
                </div>
                {publishBlockedReason && (
                  <p className="text-caption text-muted-soft">{publishBlockedReason}</p>
                )}
                <p className="text-caption text-muted-soft">
                  恢复上一版会重新校验视频可见性与来源，不会带回已下线或来源失效的视频。
                </p>
              </Card>
            </>
          )}
        </>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        tone={confirm?.tone ?? "default"}
        title={confirm?.title}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel ?? "确认"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const current = confirm;
          setConfirm(null);
          current?.action();
        }}
      />

      <HomePreviewDialog
        open={previewOpen}
        title="首页编排预览（管理员接口）"
        preview={preview}
        loading={previewLoading}
        error={previewError}
        onClose={() => setPreviewOpen(false)}
        onRetry={loadPreview}
      />
    </div>
  );
}
