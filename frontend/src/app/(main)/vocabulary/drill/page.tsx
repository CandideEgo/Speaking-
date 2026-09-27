"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useDailySession } from "@/hooks/useDailySession";
import { useStudySession } from "@/hooks/useStudySession";
import { useVocabularyPractice } from "@/hooks/usePractice";
import { api } from "@/lib/api";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
import { WordQuizCard } from "@/components/vocabulary/WordFlashcard";
import { TrainSummary, type WeakWord } from "@/components/vocabulary/TrainSummary";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import {
  applyAnswer,
  buildDrillScheduler,
  currentEntry,
  dropCurrent,
  poolFromState,
  type DrillSchedulerState,
} from "@/lib/drillRound";
import {
  buildDrillQuestion,
  conciseTranslation,
  DRILL_KIND_LABEL,
  questionKindForAppearance,
  type DrillQuestion,
} from "@/lib/drillQuestions";
import type { VocabularyWord } from "@/types";

/**
 * 全屏单词训练。
 * - 默认：一条全程选择题循环（S5）——本轮新词按出现间隔反复出题、连对两次
 *   毕业，到期复习词追加在队尾各问一次；没有「闪卡学新词 → 复习测验」的
 *   两阶段划分，也没有自评双按钮。调度规则在 `lib/drillRound.ts`（纯函数）。
 * - ?video_id=：EndScreen「复习本视频生词」深链，保持纯测验行为（不进本轮循环）。
 *
 * 新词的作答与毕业由后端 `study_sessions` 承载（DEC-053）：每题作答逐条落库，
 * 进入时先查未完成的一轮续上。复习词走 practice/submit 批量提交端点，
 * 复习线词由后端按错误次数分档落库（DEC-057）。
 */
export default function VocabDrillPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const searchParams = useSearchParams();
  const videoId = searchParams.get("video_id") ?? undefined;

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  if (videoId) {
    return <VideoScopedDrill videoId={videoId} />;
  }
  return <DailyTraining />;
}

/** Drill header: 退出 + 阶段标签 + 进度条 + 计数。 */
function DrillHeader({
  label,
  answered,
  total,
}: {
  label: string;
  answered: number;
  total: number;
}) {
  const pct = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="sticky top-0 z-30 bg-canvas/92 backdrop-blur border-b border-hairline">
      <div className="max-w-[880px] mx-auto flex items-center gap-3.5 px-4 py-3">
        <Link
          href="/vocabulary"
          aria-label="退出训练"
          className="w-[34px] h-[34px] rounded-md text-muted flex items-center justify-center hover:text-ink hover:bg-surface-card transition-colors flex-shrink-0"
        >
          <X size={20} />
        </Link>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface-card text-[13px] font-semibold text-ink flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-brand-500" />
          {label}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-surface-card overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted font-mono flex-shrink-0">
          {answered}/{total}
        </span>
      </div>
    </div>
  );
}

/** ?video_id= 深链：只测验本视频生词（原 drill 行为）。 */
function VideoScopedDrill({ videoId }: { videoId: string }) {
  const session = useVocabularyPractice({
    count: 10,
    dueOnly: false,
    videoId,
  });
  const total = session.items.length;
  const answered = Object.keys(session.graded).length;

  return (
    <main className="min-h-full bg-surface-soft">
      <DrillHeader label="本视频生词" answered={answered} total={total} />
      <div className="max-w-[880px] mx-auto px-4 py-8 pb-24">
        <UnifiedPracticePanel session={session} levelLabel="单词训练" />
      </div>
    </main>
  );
}

type Phase = "drill" | "summary";

/**
 * 今日训练主流程：一条全程选择题循环。
 *
 * 队列 = 本轮未毕业的新词（每答一题写回 `study_sessions`：连对计数、毕业）
 * + 到期复习词（`daily-session` 的 review_words，各问一次，走批量提交端点）。
 * 调度（出现间隔、毕业、续轮推导）与题型轮换都在 `lib/` 的纯函数里，
 * 本组件只负责落库与推进。中途刷新：新词进度从落库状态续上，已答过的复习词
 * 因后端更新 `next_review_at` 自然退出到期队列。
 * 「再加练一轮」= 结束当前轮 + 再开一轮 `kind=extra`（计入今日累计，不计入
 * 今日目标）。
 */
function DailyTraining() {
  const daily = useDailySession(true);
  const round = useStudySession(true);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [sched, setSched] = useState<DrillSchedulerState | null>(null);
  const [pool, setPool] = useState<VocabularyWord[]>([]);
  const [question, setQuestion] = useState<DrillQuestion | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [progress, setProgress] = useState({ learned: 0, asked: 0, correct: 0, done: 0 });
  const [weak, setWeak] = useState<WeakWord[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const fetchStats = useVocabularyStore((s) => s.fetchStats);

  const loading = round.loading || daily.loading;
  const error = round.error ?? daily.error;

  // 轮次与到期词就绪后一次性建队（加练开新轮时 sched 已被置空，走同一入口）。
  useEffect(() => {
    if (loading || error || phase || sched) return;
    const state = buildDrillScheduler(round.round?.items ?? [], daily.session?.reviewWords ?? []);
    setSched(state);
    setPool(poolFromState(state));
    setPhase(state.entries.length > 0 ? "drill" : "summary");
  }, [loading, error, phase, sched, round.round, daily.session]);

  // 队首出题：按出现次序定题型，从词池造选项。构造失败（词池太小）则跳过该词。
  // 只在「记一次作答」时改 sched——反馈展示期间队列不动，「下一个」点了才推进。
  useEffect(() => {
    if (phase !== "drill" || !sched) return;
    const entry = currentEntry(sched);
    if (!entry) {
      fetchStats();
      setPhase("summary");
      return;
    }
    const built = buildDrillQuestion(entry.word, pool, questionKindForAppearance(entry.appearance));
    if (built) {
      setQuestion(built);
    } else {
      setSched(dropCurrent(sched));
    }
  }, [phase, sched, pool, fetchStats]);

  /** 记一次作答：本地调度不动（等「下一个」），落库异步跟随。 */
  function handleAnswer(correct: boolean) {
    const entry = sched ? currentEntry(sched) : null;
    if (!entry) return;
    setLastCorrect(correct);
    setProgress((p) => ({
      learned: p.learned + (entry.source === "round" && !entry.answered ? 1 : 0),
      asked: p.asked + 1,
      correct: p.correct + (correct ? 1 : 0),
      done: p.done,
    }));
    if (!correct) {
      const translation = conciseTranslation(entry.word) || entry.word.definition || null;
      setWeak((ws) =>
        ws.some((w) => w.word === entry.word.word)
          ? ws
          : [...ws, { word: entry.word.word, translation }]
      );
    }
    if (entry.source === "round") {
      round
        .answer(entry.vocabularyId, correct)
        .catch(() => toast.error(`「${entry.word.word}」学习记录同步失败`));
    } else {
      // 到期复习词：与复习同一写入口（practice/submit，复习线词按 DEC-057 分档）。
      api("/api/v1/vocabulary/practice/submit", {
        method: "POST",
        body: JSON.stringify({ results: [{ word: entry.word.word, correct }] }),
      }).catch(() => toast.error(`「${entry.word.word}」学习记录同步失败`));
    }
  }

  /** 「下一个」：出队 + 按间隔重插（调度规则在 lib/drillRound.ts）。 */
  function handleNext() {
    if (!sched || lastCorrect === null) return;
    const outcome = applyAnswer(sched, lastCorrect);
    setProgress((p) => ({ ...p, done: p.done + (outcome.done ? 1 : 0) }));
    setSched(outcome.state);
    setLastCorrect(null);
  }

  /** 再加练一轮：结束当前轮 → 再取一轮配额的新词（kind=extra）。 */
  async function handleExtraRound() {
    if (extraLoading) return;
    setExtraLoading(true);
    try {
      await round.finish();
      const next = await round.start("extra");
      if (!next || next.items.length === 0) {
        toast.info("暂时没有更多新词了，明天再来");
        return;
      }
      // 重新取到期词：本轮答过的复习词已不再到期，不能带进加练轮。
      await daily.refresh();
      setProgress({ learned: 0, asked: 0, correct: 0, done: 0 });
      setWeak([]);
      setLastCorrect(null);
      setQuestion(null);
      setPool([]);
      setSched(null);
      setPhase(null); // 交给上面的 effect 按新一轮重新建队
      fetchStats();
    } catch {
      toast.error("加练开启失败，请稍后再试");
    } finally {
      setExtraLoading(false);
    }
  }

  // 错误优先于加载态：请求失败时 phase 永远不会被推导出来，先判 loading 会永远转圈
  if (error) {
    return (
      <main className="min-h-full bg-surface-soft">
        <DrillHeader label="今日训练" answered={0} total={0} />
        <div className="max-w-[880px] mx-auto px-4 py-16">
          <ErrorState title={error} onRetry={round.reload} />
        </div>
      </main>
    );
  }

  if (loading || !phase) {
    return (
      <main className="min-h-full bg-surface-soft">
        <DrillHeader label="今日训练" answered={0} total={0} />
        <FullPageSpinner />
      </main>
    );
  }

  if (phase === "drill") {
    return (
      <main className="min-h-full bg-surface-soft">
        <DrillHeader
          label={question ? DRILL_KIND_LABEL[question.kind] : "今日训练"}
          answered={progress.done}
          total={Math.max(pool.length, progress.done, 1)}
        />
        <div className="max-w-[880px] mx-auto px-4 py-8 pb-24 animate-fade-in">
          {question ? (
            <WordQuizCard
              key={`${question.vocabularyId}-${question.kind}-${question.answer}`}
              question={question}
              onAnswer={handleAnswer}
              onNext={handleNext}
            />
          ) : (
            <FullPageSpinner />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-surface-soft">
      <DrillHeader
        label="今日训练"
        answered={progress.done}
        total={Math.max(pool.length, progress.done, 1)}
      />
      <div className="max-w-[880px] mx-auto px-4 py-10 pb-24">
        <TrainSummary
          learnedCount={progress.learned}
          quizTotal={progress.asked}
          quizCorrect={progress.correct}
          weakWords={weak}
          onRestart={handleExtraRound}
          restartLoading={extraLoading}
        />
      </div>
    </main>
  );
}
