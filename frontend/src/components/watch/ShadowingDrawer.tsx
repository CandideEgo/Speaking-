"use client";

import { useState, type RefObject } from "react";
import { Loader2, Mic, Repeat, Check, X } from "lucide-react";
import { AudioWaveform } from "@/components/speaking/AudioWaveform";
import { WaveformCompare } from "@/components/speaking/WaveformCompare";
import { ShadowingHistory } from "@/components/watch/ShadowingHistory";
import { SheetHandle, SHEET_CLOSE_DRAG_PX } from "@/components/watch/SheetHandle";
import { useSheetGeometry } from "@/hooks/useSheetGeometry";
import { Button } from "@/components/ui/Button";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ShadowingAttempt } from "@/hooks/useShadowing";

/** #26 决议乙的默认档：半屏抽屉（400px），再高就是「抬到画面下沿」那一档。 */
const SHEET_HALF_SCREEN_PX = 400;

export interface ShadowingDrawerProps {
  /** 画框元素（视频槽位）—— 抽屉顶边的上限：不许压住画面里的当前句。 */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** 当前句 */
  index: number;
  total: number;
  textEn: string;
  textZh: string | null;
  /** 录音状态（useSpeakingRecorder） */
  speakingState: "idle" | "listening" | "reviewing";
  seconds: number;
  recordingStream: MediaStream | null;
  audioBlob: Blob | null;
  audioUrl: string | null;
  uploading: boolean;
  saved: boolean;
  satisfied: boolean;
  canSatisfy: boolean;
  originalUrl: string | null;
  originalClip: { start: number; end: number } | null;
  onPlayOriginal: () => void;
  onStart: () => void;
  onStop: () => void;
  onReRecord: () => void;
  onToggleSatisfied: () => void;
  onNext: () => void;
  /** 逐句跟读模式（useSentenceShadowing） */
  sentenceActive: boolean;
  sentencePhase: "playing" | "recording" | "reviewing" | null;
  /** ⑤ 自动推进：默认关（#26 决议），开了就「录音一停就换句」。 */
  autoAdvance: boolean;
  onAutoAdvanceChange: (v: boolean) => void;
  attempts: ShadowingAttempt[];
  onDeleteAttempt: (id: string) => void;
  /** YouTube 源时序不可控：逐句跟读置灰。 */
  ytMode: boolean;
}

/**
 * ShadowingDrawer — 移动端跟读练习的容器：**底部抽屉**（#26 决议乙）。
 *
 * 入口不动（伴侣条原位的「逐句跟读 / 录音」），只换容器：练习 UI（计时、波形、
 * 原声/我的对比、动作行、最近跟读）从字幕卡里搬进抽屉。硬约束是「展开态不能挤掉
 * 播放器」，所以抽屉顶边被夹在画框下沿之下：默认半屏 400px，画框低到 400px 会
 * 压住它时自动落到「抬到画面下沿」那一档 —— 画面与其入画字幕一像素不盖。
 */
export function ShadowingDrawer({
  anchorRef,
  onClose,
  index,
  total,
  textEn,
  textZh,
  speakingState,
  seconds,
  recordingStream,
  audioBlob,
  audioUrl,
  uploading,
  saved,
  satisfied,
  canSatisfy,
  originalUrl,
  originalClip,
  onPlayOriginal,
  onStart,
  onStop,
  onReRecord,
  onToggleSatisfied,
  onNext,
  sentenceActive,
  sentencePhase,
  autoAdvance,
  onAutoAdvanceChange,
  attempts,
  onDeleteAttempt,
  ytMode,
}: ShadowingDrawerProps) {
  const geo = useSheetGeometry(anchorRef, true);
  const [dy, setDy] = useState(0);
  const [mergedWave, setMergedWave] = useState(false);

  if (!geo) return null;

  // 顶边：默认半屏 400px（#26 决议乙），但**绝不高于画框下沿** —— 画面里的当前句
  // 永远不被压住。两条约束打架时硬约束优先（短视口下自动落到「贴画面下沿」那一档）。
  const top = Math.max(8, Math.max(geo.bottom - SHEET_HALF_SCREEN_PX, geo.frameBottom));
  const height = Math.max(120, geo.bottom - top);

  const mode: "idle" | "playing" | "rec" | "review" =
    speakingState === "listening"
      ? "rec"
      : speakingState === "reviewing"
        ? "review"
        : sentenceActive && sentencePhase === "playing"
          ? "playing"
          : "idle";

  const stateText: Record<typeof mode, string> = {
    idle: "点麦克风开始 —— 先听一遍原句",
    playing: "正在放本句…（放完自动开录）",
    rec: "● 录音中 —— 读完点停止",
    review: uploading
      ? "正在保存跟读录音…"
      : saved
        ? "已保存 —— 对比一下原声"
        : "录音完成 —— 回放听自己的发音",
  };

  return (
    <div
      data-testid="shadowing-drawer"
      role="dialog"
      aria-label="跟读练习"
      style={{ top, height, transform: dy ? `translateY(${dy}px)` : undefined }}
      className={cn(
        "fixed inset-x-0 z-50 flex flex-col overflow-hidden bg-canvas",
        "rounded-t-2xl border-t border-hairline shadow-lift",
        dy === 0 && "transition-transform duration-150"
      )}
    >
      <SheetHandle
        testId="shadowing-drawer-grab"
        onDrag={setDy}
        onRelease={(d) => {
          setDy(0);
          if (d > SHEET_CLOSE_DRAG_PX) onClose();
        }}
      />

      {/* 顶边第一件事：把「要跟读的这一句」钉住，视线不必回到画面上 */}
      <div className="shrink-0 px-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            要跟读的这一句
          </span>
          <span className="text-[11px] font-mono text-muted-soft" data-testid="drawer-counter">
            {index + 1} / {total}
          </span>
        </div>
        <div
          data-testid="drawer-sentence-en"
          className="mt-1 text-[15px] font-semibold leading-snug text-ink"
        >
          {textEn}
        </div>
        {textZh && <div className="mt-0.5 text-xs leading-relaxed text-muted">{textZh}</div>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
        {/* 状态行 + 计时（计时是 #26 点名的现状缺口：seconds 有值但从来没画出来） */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]",
            mode === "rec" ? "bg-red-soft text-error" : "bg-surface-soft text-muted"
          )}
        >
          {mode === "review" && uploading ? (
            <Loader2 size={13} className="shrink-0 animate-spin text-brand-500" />
          ) : mode === "review" && saved ? (
            <Check size={13} className="shrink-0 text-success" />
          ) : (
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                mode === "rec" ? "animate-pulse bg-error" : "bg-muted-soft"
              )}
            />
          )}
          <span className="min-w-0 flex-1" data-testid="drawer-state">
            {stateText[mode]}
          </span>
          {mode === "rec" && (
            <span
              data-testid="recording-timer"
              className="shrink-0 font-mono text-[12px] tabular-nums text-error"
            >
              {formatTime(seconds)}
            </span>
          )}
        </div>

        {/* 波形：录音中一条实时（按容器实宽），回放态才出对比 */}
        {mode === "rec" && (
          <div className="mt-3">
            <AudioWaveform stream={recordingStream} barCount={48} className="h-11 w-full" />
          </div>
        )}

        {mode === "review" && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                原声 / 我的
              </span>
              <button
                type="button"
                onClick={() => setMergedWave((v) => !v)}
                className="cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-600 hover:bg-brand-50"
                data-testid="wave-merge-toggle"
              >
                {mergedWave ? "两条分开" : "合并一条"}
              </button>
            </div>
            <WaveformCompare
              recordingBlob={audioBlob}
              recordingUrl={audioUrl}
              originalUrl={originalUrl}
              originalClip={originalClip}
              onPlayOriginal={onPlayOriginal}
              merged={mergedWave}
              minTarget="lg"
            />
          </div>
        )}

        {/* ⑤ 自动推进：默认关；开了就是「录音一停就换句」，会把你没准备好的句子换掉 */}
        <button
          type="button"
          role="switch"
          aria-checked={autoAdvance}
          data-testid="auto-advance"
          onClick={() => onAutoAdvanceChange(!autoAdvance)}
          className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-left"
        >
          <span
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              autoAdvance ? "bg-brand-500" : "bg-cream-strong"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-canvas transition-[left]",
                autoAdvance ? "left-[18px]" : "left-0.5"
              )}
            />
          </span>
          <span className="text-[12px] text-body">
            自动推进
            <span className="ml-1 text-muted-soft">录音一停就换下一句</span>
          </span>
        </button>

        {/* 最近跟读（练习区的一部，跟波形一起搬进抽屉） */}
        <ShadowingHistory attempts={attempts.slice(0, 5)} onDelete={onDeleteAttempt} />
      </div>

      {/* 动作行：一律 44px 触控目标（#26 ③） */}
      <div
        data-testid="drawer-actions"
        className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-3"
      >
        {mode === "rec" && (
          <>
            <Button
              className="min-h-[44px] flex-1 bg-error hover:bg-error/90 shadow-none"
              onClick={onStop}
              icon={Mic}
            >
              停止录音
            </Button>
            <Button variant="outline" className="min-h-[44px] flex-1" onClick={onClose} icon={X}>
              取消
            </Button>
          </>
        )}

        {mode === "review" && (
          <>
            <Button variant="outline" className="min-h-[44px] flex-1" onClick={onReRecord}>
              重录
            </Button>
            <Button
              variant={satisfied ? "primary" : "outline"}
              className={cn(
                "min-h-[44px] flex-1",
                satisfied && "bg-success hover:bg-success/90 shadow-none"
              )}
              onClick={onToggleSatisfied}
              disabled={uploading || !canSatisfy}
              title={uploading || !canSatisfy ? "录音保存后可标记" : undefined}
              icon={Check}
            >
              满意
            </Button>
            <Button className="min-h-[44px] flex-1" onClick={onNext}>
              下一句
            </Button>
          </>
        )}

        {mode === "playing" && (
          <Button variant="outline" className="min-h-[44px] flex-1" onClick={onClose} icon={X}>
            取消
          </Button>
        )}

        {mode === "idle" && (
          <>
            <Button
              className="min-h-[44px] flex-1"
              onClick={onStart}
              disabled={ytMode}
              title={ytMode ? "YouTube 视频暂不支持逐句跟读" : undefined}
              icon={Mic}
            >
              开始跟读本句
            </Button>
            {ytMode && (
              <span className="flex items-center gap-1 text-[11px] text-muted-soft">
                <Repeat size={12} />
                YouTube 源不可用
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
