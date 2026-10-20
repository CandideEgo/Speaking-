"use client";

import { BookOpen, Mic, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface EndScreenStats {
  watchSeconds: number;
  wordsLookedUp: number;
  wordsAdded: number;
}

export interface ShadowingSentence {
  subtitle_id: string;
  sentence_index: number;
  text_en: string;
  text_zh: string | null;
  start_time: number;
  end_time: number;
  exam_word_count: number;
}

interface EndScreenProps {
  stats: EndScreenStats;
  videoVocabCount: number;
  shadowingSentences: ShadowingSentence[];
  onReplay: () => void;
  onReviewVocab: () => void;
  onShadowing: () => void;
  onGoHome: () => void;
}

/**
 * D3b EndScreen — 播放结束后的下一步。
 *
 * 版式从「覆盖在画框里」改成**页面级覆盖**（`fixed inset-0`）：画框是 16:9，1280×720
 * 只有 299px 高、375×812 只有 193px 高，而这张卡固定 455px 高 —— 旧版把标题和一半出口
 * 裁在画框外，用户点不到「返回首页」。页面级覆盖后内容撑满视口、内部可滚动，4 个出口
 * 在任何一档都完整可见可点（`e2e/watch-end-screen.spec.ts` 守这条）。
 *
 * 仍然只渲染在 `ended` 时（页面条件渲染）：播放中的 `video-frame` 必须保持零文字，
 * 这是 mobile-watch-chrome.spec.ts 判据 1，别把本组件挪成常驻覆盖。
 */
export function EndScreen({
  stats,
  videoVocabCount,
  shadowingSentences,
  onReplay,
  onReviewVocab,
  onShadowing,
  onGoHome,
}: EndScreenProps) {
  const minutes = Math.round(stats.watchSeconds / 60);

  return (
    <div
      data-testid="end-screen"
      role="dialog"
      aria-modal="true"
      aria-label="本节已看完"
      className="fixed inset-0 z-[70] flex overflow-y-auto bg-canvas/95 backdrop-blur-sm animate-fade-in"
    >
      <div className="m-auto w-full max-w-md px-4 py-6 text-center">
        <div className="mb-4">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <BookOpen size={20} />
          </span>
          <h2 className="mt-2 text-title font-bold text-ink">本节已看完</h2>
          <p className="mt-1 text-meta text-muted">下一步选一个，10 秒内搞定</p>
        </div>

        {/* Stats summary */}
        <div className="mb-5 grid grid-cols-3 gap-2.5">
          <div className="rounded-lg bg-surface-soft px-2 py-2">
            <div className="text-copy-lg font-bold text-ink tabular-nums">{minutes}</div>
            <div className="text-caption text-muted">分钟</div>
          </div>
          <div className="rounded-lg bg-surface-soft px-2 py-2">
            <div className="text-copy-lg font-bold text-ink tabular-nums">
              {stats.wordsLookedUp}
            </div>
            <div className="text-caption text-muted">查词</div>
          </div>
          <div className="rounded-lg bg-surface-soft px-2 py-2">
            <div className="text-copy-lg font-bold text-ink tabular-nums">{stats.wordsAdded}</div>
            <div className="text-caption text-muted">加词</div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {videoVocabCount > 0 && (
            <Button type="button" onClick={onReviewVocab} className="w-full min-h-[44px]">
              <BookOpen size={16} />
              复习本视频生词（{videoVocabCount}）
            </Button>
          )}
          {shadowingSentences.length > 0 && (
            <Button
              type="button"
              onClick={onShadowing}
              variant="outline"
              className="w-full min-h-[44px]"
            >
              <Mic size={16} />
              跟读重点句（{shadowingSentences.length} 句）
            </Button>
          )}
          <Button type="button" onClick={onReplay} variant="ghost" className="w-full min-h-[44px]">
            <RotateCcw size={16} />
            再看一遍
          </Button>
          <button
            type="button"
            onClick={onGoHome}
            className="mt-1 inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 text-meta text-muted-soft hover:text-muted"
          >
            <Home size={11} />
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
