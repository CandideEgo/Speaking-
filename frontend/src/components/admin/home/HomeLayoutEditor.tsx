"use client";

/**
 * 首页编排编辑器（`/admin/home-editorial`，契约 §7.2）。
 *
 * 内容与位置分离：这里只挑「已发布且来源有效」的内容版本，把它们放到
 * 主推 1 / 次推 ≤2 / 换个说法 1 / 今天就能用 ≤3。写操作全部带 expected_revision；
 * 发布前展示字段级 issues，发布/回滚都是服务端原子操作。
 *
 * 旧「首页展示」开关是精选候选池，与这里的主推位置无关——页面上明确说明。
 *
 * A15 拆分后的分工：状态与写路径在 `hooks/useHomeLayoutEditor`，四个位置分区在
 * `LayoutSlotSections`，候选选择与位置总览各自成文件；本文件只保留版面骨架。
 */

import { Eye, LayoutTemplate, Loader2, RefreshCw, Rocket, RotateCcw, Save } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { REVISION_CONFLICT_MESSAGE } from "@/lib/adminHomeContent";
import { useHomeLayoutEditor } from "@/hooks/useHomeLayoutEditor";
import { HomeLayoutIssues } from "./HomeLayoutIssues";
import { HomePreviewDialog } from "./HomePreviewDialog";
import { LayoutPositionSummary, StatusCell } from "./LayoutPositionSummary";
import {
  ExpressionSection,
  LeadSection,
  ScenarioSection,
  SecondarySection,
} from "./LayoutSlotSections";
import { formatDateTime } from "./format";

export function HomeLayoutEditor() {
  const editor = useHomeLayoutEditor();
  const {
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
  } = editor;

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
                <LeadSection
                  placement={placement}
                  candidates={candidates}
                  excludeVideoIds={leadExcludedVideoIds}
                  leadCandidate={leadCandidate}
                  onChange={setLead}
                />
                <SecondarySection
                  placement={placement}
                  candidates={candidates}
                  candidateById={candidateById}
                  busy={busy}
                  excludedVideoIds={secondaryExcludedVideoIds}
                  onAdd={addSecondary}
                  onRemove={removeSecondary}
                  onMove={moveSecondary}
                  onChange={setSecondary}
                />
                <ExpressionSection
                  placement={placement}
                  expressionCandidates={expressionCandidates}
                  candidateById={candidateById}
                  busy={busy}
                  onSetRevision={setExpressionRevision}
                  onSetId={setExpressionId}
                />
                <ScenarioSection
                  placement={placement}
                  scenarioCandidates={scenarioCandidates}
                  candidateById={candidateById}
                  busy={busy}
                  onAdd={addScenarioSlot}
                  onRemove={removeScenarioSlot}
                  onSetRevision={setScenarioRevision}
                  onSetId={setScenarioId}
                />
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
