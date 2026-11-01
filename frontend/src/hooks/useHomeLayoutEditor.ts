"use client";

/**
 * 首页编排编辑器的状态机（FE-06 / A15 按业务边界拆分）。
 *
 * 页面组件原先同时持有 13 个 `useState`、四个位置的增删改、保存/发布/回滚
 * 三条写路径与预览加载，再把它们直接摊进 700 行 JSX。这里把**状态与写路径**
 * 收成一个 hook，渲染侧只剩组件树。
 *
 * 对外契约不变：收到 `HomeLayoutState` 后以服务端草稿为准（除非本地有未保存
 * 修改），写操作一律带 `expected_revision`，冲突时进入 `conflict` 态而不覆盖。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiErrorMessage, toastApiError } from "@/lib/errors";
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
import type { HomeLayoutPlacement, HomeLayoutPreview, HomeLayoutState } from "@/types/homeContent";

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  action: () => void;
}

/** 四个位置共用的草稿更新入口：置脏并清掉上一次的冲突标记。 */
export type PlacementUpdater = (
  updater: (current: HomeLayoutPlacement) => HomeLayoutPlacement
) => void;

export function useHomeLayoutEditor() {
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

  const updatePlacement: PlacementUpdater = useCallback((updater) => {
    setPlacement((current) => updater(current));
    dirtyRef.current = true;
    setDirty(true);
    setConflict(false);
  }, []);

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

  const secondaryExcludedVideoIds = useCallback(
    (slotIndex: number): Set<string> => {
      const excluded = new Set<string>();
      if (leadVideoId) excluded.add(leadVideoId);
      placement.secondary.forEach((slot, index) => {
        if (index === slotIndex) return;
        const videoId = candidateById.get(slot.content_revision_id)?.video_id;
        if (videoId) excluded.add(videoId);
      });
      return excluded;
    },
    [leadVideoId, placement.secondary, candidateById]
  );

  const publishedLeadCandidate = state?.published_layout?.lead?.content_revision_id
    ? candidateById.get(state.published_layout.lead.content_revision_id)
    : undefined;

  // --- 主推 ---
  // 换主推时同时清掉不跟随新主推的场景槽位（场景只能来自主推版本）。
  const setLead = useCallback(
    (contentRevisionId: string | null) => {
      updatePlacement((current) => ({
        ...current,
        lead: contentRevisionId ? { content_revision_id: contentRevisionId } : null,
        scenarios: current.scenarios.filter(
          (slot) => slot.content_revision_id === contentRevisionId
        ),
      }));
    },
    [updatePlacement]
  );

  // --- 次推 ---
  const addSecondary = useCallback(() => {
    if (placement.secondary.length >= 2) return;
    updatePlacement((current) => ({
      ...current,
      secondary: [...current.secondary, { content_revision_id: "" }],
    }));
  }, [placement.secondary.length, updatePlacement]);

  const removeSecondary = useCallback(
    (index: number) => {
      updatePlacement((current) => ({
        ...current,
        secondary: current.secondary.filter((_, currentIndex) => currentIndex !== index),
      }));
    },
    [updatePlacement]
  );

  const moveSecondary = useCallback(
    (index: number, direction: -1 | 1) => {
      updatePlacement((current) => {
        const target = index + direction;
        if (target < 0 || target >= current.secondary.length) return current;
        const next = [...current.secondary];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        return { ...current, secondary: next };
      });
    },
    [updatePlacement]
  );

  const setSecondary = useCallback(
    (index: number, contentRevisionId: string | null) => {
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
    },
    [removeSecondary, updatePlacement]
  );

  // --- 换个说法 ---
  const setExpressionRevision = useCallback(
    (contentRevisionId: string | null) => {
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
    },
    [candidateById, updatePlacement]
  );

  const setExpressionId = useCallback(
    (expressionId: string) => {
      updatePlacement((current) => {
        if (!current.expression) return current;
        return {
          ...current,
          expression: { ...current.expression, expression_id: expressionId },
        };
      });
    },
    [updatePlacement]
  );

  // --- 今天就能用 ---
  const addScenarioSlot = useCallback(() => {
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
  }, [placement.scenarios.length, scenarioCandidates, updatePlacement]);

  const removeScenarioSlot = useCallback(
    (index: number) => {
      updatePlacement((current) => ({
        ...current,
        scenarios: current.scenarios.filter((_, currentIndex) => currentIndex !== index),
      }));
    },
    [updatePlacement]
  );

  const setScenarioRevision = useCallback(
    (index: number, contentRevisionId: string | null) => {
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
    },
    [candidateById, removeScenarioSlot, updatePlacement]
  );

  const setScenarioId = useCallback(
    (index: number, scenarioId: string) => {
      updatePlacement((current) => ({
        ...current,
        scenarios: current.scenarios.map((slot, currentIndex) =>
          currentIndex === index ? { ...slot, scenario_id: scenarioId } : slot
        ),
      }));
    },
    [updatePlacement]
  );

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

  return {
    state,
    placement,
    loading,
    loadError,
    saving,
    publishing,
    rollingBack,
    dirty,
    conflict,
    confirm,
    setConfirm,
    preview,
    previewOpen,
    setPreviewOpen,
    previewLoading,
    previewError,
    candidates,
    candidateById,
    expressionCandidates,
    scenarioCandidates,
    leadCandidate,
    leadExcludedVideoIds,
    secondaryExcludedVideoIds,
    publishedLeadCandidate,
    updatePlacement,
    setLead,
    addSecondary,
    removeSecondary,
    moveSecondary,
    setSecondary,
    setExpressionRevision,
    setExpressionId,
    addScenarioSlot,
    removeScenarioSlot,
    setScenarioRevision,
    setScenarioId,
    handleSave,
    handlePublishClick,
    handleRollbackClick,
    handleRefresh,
    loadPreview,
    busy,
    publishBlockedReason,
  };
}

export type HomeLayoutEditorModel = ReturnType<typeof useHomeLayoutEditor>;
