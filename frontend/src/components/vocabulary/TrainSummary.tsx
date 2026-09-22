"use client";

import { useRouter } from "next/navigation";
import { RotateCcw, Home, CheckCircle2, Target, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Confetti } from "@/components/common/Confetti";

export interface WeakWord {
  word: string;
  translation?: string | null;
}

/**
 * 今日训练总结（/vocabulary/drill 末阶段）：新词已学数 + 复习正确率 +
 * 薄弱词列表；正确率 ≥80% 撒花。quizTotal=0 表示今天没有到期复习词。
 */
export function TrainSummary({
  learnedCount,
  quizTotal,
  quizCorrect,
  weakWords,
  onRestart,
}: {
  learnedCount: number;
  quizTotal: number;
  quizCorrect: number;
  weakWords: WeakWord[];
  onRestart: () => void;
}) {
  const accuracy = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : null;
  const celebrate = accuracy != null ? accuracy >= 80 : learnedCount > 0;
  const nothing = learnedCount === 0 && quizTotal === 0;
  const router = useRouter();

  return (
    <div className="w-full max-w-[560px] mx-auto text-center">
      <Confetti fire={celebrate} />

      <div className="bg-canvas border border-hairline rounded-2xl shadow-lift px-6 py-10 animate-fade-in">
        {nothing ? (
          <>
            <CheckCircle2 size={44} className="mx-auto text-success" />
            <h2 className="text-xl font-extrabold text-ink mt-4">今天的词都练完了</h2>
            <p className="text-[13px] text-muted mt-2">保持节奏，明天继续。去频道看看新视频吧。</p>
          </>
        ) : (
          <>
            <Sparkles size={44} className="mx-auto text-brand-500" />
            <h2 className="text-xl font-extrabold text-ink mt-4">今日训练完成</h2>
            {accuracy != null && (
              <p className="text-[15px] text-muted mt-2">
                复习正确率{" "}
                <span
                  className={cn(
                    "font-extrabold text-2xl",
                    accuracy >= 80 ? "text-success" : "text-warning"
                  )}
                >
                  {accuracy}%
                </span>
              </p>
            )}

            <div className="flex justify-center gap-3 mt-6">
              <div className="px-5 py-3 rounded-xl bg-surface-soft">
                <div className="text-xl font-extrabold text-ink">{learnedCount}</div>
                <div className="text-[11px] text-muted mt-0.5">新词已学</div>
              </div>
              <div className="px-5 py-3 rounded-xl bg-surface-soft">
                <div className="text-xl font-extrabold text-ink flex items-center gap-1">
                  <Target size={16} className="text-brand-500" />
                  {quizTotal > 0 ? `${quizCorrect}/${quizTotal}` : "—"}
                </div>
                <div className="text-[11px] text-muted mt-0.5">复习测验</div>
              </div>
            </div>

            {weakWords.length > 0 && (
              <div className="mt-6 text-left">
                <p className="text-xs font-semibold text-muted mb-2">薄弱词，明天会优先出现</p>
                <div className="flex flex-wrap gap-1.5">
                  {weakWords.map((w) => (
                    <span
                      key={w.word}
                      className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-pill bg-surface-card text-[13px]"
                      title={w.translation ?? undefined}
                    >
                      <span className="font-semibold text-ink">{w.word}</span>
                      {w.translation && <span className="text-muted text-xs">{w.translation}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex gap-3 mt-8">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onRestart}
            icon={RotateCcw}
          >
            再来一组
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => router.push("/vocabulary")}
            icon={Home}
          >
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
