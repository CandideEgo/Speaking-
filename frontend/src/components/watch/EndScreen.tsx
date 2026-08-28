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
 * D3b EndScreen — full overlay shown when the watch page <video> ends.
 * Surfaces three low-friction next steps so the user can close the loop
 * without leaving the video context. Buttons that have no data (zero
 * vocab for this video, no shadowing sentences) are hidden entirely.
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
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/95 backdrop-blur-sm animate-fade-in">
      <div className="max-w-md w-full mx-auto p-6 text-center">
        <div className="mb-5">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-50 text-brand-500 mb-3">
            <BookOpen size={22} />
          </span>
          <h2 className="text-xl font-bold text-ink">本节已看完</h2>
          <p className="text-xs text-muted mt-1">下一步选一个，10 秒内搞定</p>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-surface-soft rounded-lg px-3 py-2.5">
            <div className="text-lg font-bold text-ink tabular-nums">{minutes}</div>
            <div className="text-[10px] text-muted">分钟</div>
          </div>
          <div className="bg-surface-soft rounded-lg px-3 py-2.5">
            <div className="text-lg font-bold text-ink tabular-nums">{stats.wordsLookedUp}</div>
            <div className="text-[10px] text-muted">查词</div>
          </div>
          <div className="bg-surface-soft rounded-lg px-3 py-2.5">
            <div className="text-lg font-bold text-ink tabular-nums">{stats.wordsAdded}</div>
            <div className="text-[10px] text-muted">加词</div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {videoVocabCount > 0 && (
            <Button onClick={onReviewVocab} className="w-full">
              <BookOpen size={16} />
              复习本视频生词（{videoVocabCount}）
            </Button>
          )}
          {shadowingSentences.length > 0 && (
            <Button onClick={onShadowing} variant="outline" className="w-full">
              <Mic size={16} />
              跟读重点句（{shadowingSentences.length} 句）
            </Button>
          )}
          <Button onClick={onReplay} variant="ghost" className="w-full">
            <RotateCcw size={16} />
            再看一遍
          </Button>
          <button onClick={onGoHome} className="text-xs text-muted-soft hover:text-muted mt-2">
            <Home size={11} className="inline mr-1 -mt-0.5" />
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
