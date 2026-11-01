"use client";

/**
 * 首页编排的四个位置分区：主推 / 次推 / 换个说法 / 今天就能用（契约 §7.2）。
 *
 * 它们共享同一个候选池与禁用规则（见 LayoutCandidateSelect），差别只在槽位
 * 上限、排序能力和第二个下拉框（表达 id / 场景 id）。之前四段 JSX 与编辑器的
 * 状态机混在同一个组件里，改一个上限要在一千行里找。
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { HomeContentCandidate, HomeLayoutPlacement } from "@/types/homeContent";
import { CandidateSelect, CandidateSummary } from "./LayoutCandidateSelect";

export const MAX_SECONDARY_SLOTS = 2;
export const MAX_SCENARIO_SLOTS = 3;

export function LeadSection({
  placement,
  candidates,
  excludeVideoIds,
  leadCandidate,
  onChange,
}: {
  placement: HomeLayoutPlacement;
  candidates: HomeContentCandidate[];
  excludeVideoIds: Set<string>;
  leadCandidate: HomeContentCandidate | undefined;
  onChange: (contentRevisionId: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-copy font-semibold text-ink">主推（1 条）</h2>
        <span className="text-caption text-muted">无编排时使用普通精选，同样展示单视频卡</span>
      </div>
      <CandidateSelect
        candidates={candidates}
        value={placement.lead?.content_revision_id ?? null}
        excludeVideoIds={excludeVideoIds}
        emptyLabel="暂不设置主推"
        onChange={onChange}
      />
      {leadCandidate && <CandidateSummary candidate={leadCandidate} />}
    </div>
  );
}

export function SecondarySection({
  placement,
  candidates,
  candidateById,
  busy,
  excludedVideoIds,
  onAdd,
  onRemove,
  onMove,
  onChange,
}: {
  placement: HomeLayoutPlacement;
  candidates: HomeContentCandidate[];
  candidateById: Map<string, HomeContentCandidate>;
  busy: boolean;
  excludedVideoIds: (slotIndex: number) => Set<string>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onChange: (index: number, contentRevisionId: string | null) => void;
}) {
  return (
    <div className="space-y-2 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-copy font-semibold text-ink">次推（最多 {MAX_SECONDARY_SLOTS} 条）</h2>
        <Button
          variant="outline"
          size="compact"
          icon={Plus}
          disabled={placement.secondary.length >= MAX_SECONDARY_SLOTS || busy}
          onClick={onAdd}
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
                  excludeVideoIds={excludedVideoIds(index)}
                  emptyLabel="选择次推内容"
                  onChange={(contentRevisionId) => onChange(index, contentRevisionId)}
                />
                {slot.content_revision_id && candidateById.get(slot.content_revision_id) && (
                  <CandidateSummary candidate={candidateById.get(slot.content_revision_id)!} />
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="compact"
                  icon={ArrowUp}
                  disabled={index === 0 || busy}
                  onClick={() => onMove(index, -1)}
                  title="上移"
                >
                  上移
                </Button>
                <Button
                  variant="outline"
                  size="compact"
                  icon={ArrowDown}
                  disabled={index === placement.secondary.length - 1 || busy}
                  onClick={() => onMove(index, 1)}
                  title="下移"
                >
                  下移
                </Button>
                <Button
                  variant="ghost"
                  size="compact"
                  icon={Trash2}
                  disabled={busy}
                  onClick={() => onRemove(index)}
                >
                  移除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpressionSection({
  placement,
  expressionCandidates,
  candidateById,
  busy,
  onSetRevision,
  onSetId,
}: {
  placement: HomeLayoutPlacement;
  expressionCandidates: HomeContentCandidate[];
  candidateById: Map<string, HomeContentCandidate>;
  busy: boolean;
  onSetRevision: (contentRevisionId: string | null) => void;
  onSetId: (expressionId: string) => void;
}) {
  const expressionCandidate = placement.expression
    ? candidateById.get(placement.expression.content_revision_id)
    : undefined;
  const expressionIds = expressionCandidate?.expression_ids ?? [];
  return (
    <div className="space-y-2 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-copy font-semibold text-ink">换个说法（最多 1 条）</h2>
        {placement.expression && (
          <Button
            variant="ghost"
            size="compact"
            icon={Trash2}
            disabled={busy}
            onClick={() => onSetRevision(null)}
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
            onChange={onSetRevision}
          />
          <Select
            value={placement.expression.expression_id}
            onChange={(event) => onSetId(event.target.value)}
          >
            {!expressionIds.includes(placement.expression.expression_id) && (
              <option value={placement.expression.expression_id}>（引用的表达已不在该版本）</option>
            )}
            {expressionIds.map((expressionId) => (
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
          onClick={() => onSetRevision(expressionCandidates[0]?.content_revision_id ?? null)}
        >
          选择表达卡
        </Button>
      )}
      {expressionCandidates.length === 0 && (
        <p className="text-caption text-muted">还没有带表达（expressions）的已发布内容版本。</p>
      )}
    </div>
  );
}

export function ScenarioSection({
  placement,
  scenarioCandidates,
  candidateById,
  busy,
  onAdd,
  onRemove,
  onSetRevision,
  onSetId,
}: {
  placement: HomeLayoutPlacement;
  scenarioCandidates: HomeContentCandidate[];
  candidateById: Map<string, HomeContentCandidate>;
  busy: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSetRevision: (index: number, contentRevisionId: string | null) => void;
  onSetId: (index: number, scenarioId: string) => void;
}) {
  return (
    <div className="space-y-2 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-copy font-semibold text-ink">
          今天就能用（最多 {MAX_SCENARIO_SLOTS} 条）
        </h2>
        <Button
          variant="outline"
          size="compact"
          icon={Plus}
          disabled={
            placement.scenarios.length >= MAX_SCENARIO_SLOTS ||
            scenarioCandidates.length === 0 ||
            busy
          }
          onClick={onAdd}
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
            const scenarioIds = candidate?.scenario_ids ?? [];
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
                  onChange={(contentRevisionId) => onSetRevision(index, contentRevisionId)}
                />
                <Select
                  value={slot.scenario_id}
                  onChange={(event) => onSetId(index, event.target.value)}
                >
                  {!scenarioIds.includes(slot.scenario_id) && (
                    <option value={slot.scenario_id}>（引用的场景已不在该版本）</option>
                  )}
                  {scenarioIds.map((scenarioId) => (
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
                  onClick={() => onRemove(index)}
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
  );
}
