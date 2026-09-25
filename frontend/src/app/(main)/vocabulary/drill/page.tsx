"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useDailySession } from "@/hooks/useDailySession";
import { useStudySession } from "@/hooks/useStudySession";
import { useVocabularyPractice } from "@/hooks/usePractice";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
import { WordFlashcard } from "@/components/vocabulary/WordFlashcard";
import { TrainSummary, type WeakWord } from "@/components/vocabulary/TrainSummary";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";

/**
 * 全屏单词训练。
 * - 默认：百词斩式两段式「今日训练」——新词闪卡（学）→ 到期复习测验（练）→ 总结。
 * - ?video_id=：EndScreen「复习本视频生词」深链，保持纯测验行为（跳过闪卡阶段）。
 *
 * 进度不再只活在 React state：一轮训练由后端 `study_sessions` 承载（DEC-053），
 * 进入时先查未完成的一轮续上，作答逐条落库。
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

type Phase = "learn" | "review" | "summary";

/** 一次复习测验的成绩快照——进入总结后 quiz 状态会被下一轮覆盖。 */
interface QuizResult {
  total: number;
  correct: number;
  weak: WeakWord[];
}

/**
 * 今日训练主流程：闪卡学新词 → 到期词测验 → 总结。
 *
 * 一轮的进度落在后端（`study_sessions`，DEC-053）：进入时先取「今日未完成的
 * 一轮」续上——闪卡从第一个 pending 项接着走、已学数取该轮已作答数，因此中途
 * 刷新或跳去视频再回来都不会从头开始。每张闪卡的作答写回该轮。
 * 「再加练一轮」= 结束当前轮 + 再开一轮 `kind=extra`（同样配额的新词，计入今日
 * 累计但不计入今日目标）。
 */
function DailyTraining() {
  const daily = useDailySession(true);
  const round = useStudySession(true);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [learnIndex, setLearnIndex] = useState(0);
  const [learned, setLearned] = useState(0);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [extraLoading, setExtraLoading] = useState(false);
  const fetchStats = useVocabularyStore((s) => s.fetchStats);

  const loading = round.loading || daily.loading;
  const error = round.error ?? daily.error;
  const hasDue = (daily.session?.totals.due_total ?? 0) > 0;
  const reviewCount = daily.session?.preferences?.daily_review_target ?? 20;

  // 本轮要学的新词；word=null 表示词已被删除，直接跳过（索引与 items 对齐）
  const words = useMemo(
    () => (round.round?.items ?? []).flatMap((i) => (i.word ? [i.word] : [])),
    [round.round]
  );
  const pendingIndex = useMemo(
    () => (round.round?.items ?? []).findIndex((i) => i.word !== null && i.status === "pending"),
    [round.round]
  );
  const answeredCount = useMemo(
    () =>
      (round.round?.items ?? []).filter((i) => i.word !== null && i.status !== "pending").length,
    [round.round]
  );

  // 轮次加载完成后决定起始阶段：有未作答的词 → 续上闪卡；否则有到期词 → 复习；否则总结。
  useEffect(() => {
    if (loading || error || phase) return;
    if (pendingIndex >= 0) {
      setPhase("learn");
      setLearnIndex(pendingIndex);
      setLearned(answeredCount);
    } else if (hasDue) {
      setPhase("review");
      setLearnIndex(0);
      setLearned(answeredCount);
    } else {
      setPhase("summary");
      setLearnIndex(0);
      setLearned(answeredCount);
    }
  }, [loading, error, phase, pendingIndex, hasDue, answeredCount]);

  // 测验阶段：allGraded 后一次性提交成绩并进入总结
  const quiz = useVocabularyPractice({
    count: reviewCount,
    dueOnly: true,
    enabled: phase === "review",
  });

  useEffect(() => {
    if (phase !== "review" || !quiz.allGraded || quizSubmitted) return;
    setQuizSubmitted(true);
    setQuizResult({
      total: quiz.items.length,
      correct: quiz.correctCount,
      weak: quiz.items
        .map((item, i) => ({ item, g: quiz.graded[i] }))
        .filter(({ g }) => g && !g.correct)
        .map(({ item }) => ({ word: item.word, translation: item.answer ?? null })),
    });
    quiz.submitResults().finally(() => {
      fetchStats();
      setPhase("summary");
    });
  }, [phase, quiz, quizSubmitted, fetchStats]);

  // 到期词在加载完成后的池子为空（竞态：到期队列刚被清空）→ 直接总结。
  // 不能只凭 quiz.loading / quiz.items.length 判空：在 phase 刚翻到 review 的那次
  // commit 里，useSession 的 refetch 还没跑（它的 setLoading(true) 要等本次 commit 的
  // effect 全部执行完才生效），这两个值都还是上一阶段的陈值，会被误判成空池并跳
  // summary —— 整个复习测验被跳过。先确认的确观察到了一次加载，再判空。
  const reviewLoadSeen = useRef(false);

  useEffect(() => {
    if (phase !== "review") {
      reviewLoadSeen.current = false;
      return;
    }
    if (quiz.loading) {
      reviewLoadSeen.current = true;
      return;
    }
    if (!reviewLoadSeen.current || quiz.error) return;
    if (quiz.items.length === 0) {
      fetchStats();
      setPhase("summary");
    }
  }, [phase, quiz.loading, quiz.error, quiz.items.length, fetchStats]);

  const currentWord = words[learnIndex] ?? null;

  /** 闪卡作答：写回本轮（同时更新该词的 SM-2 状态与今日累计），推进队列。 */
  function handleGrade(known: boolean) {
    if (!currentWord) return;
    round
      .answer(currentWord.id, known)
      .catch(() => toast.error(`「${currentWord.word}」学习记录同步失败`));

    const next = learnIndex + 1;
    setLearned((n) => n + 1);
    if (next < words.length) {
      setLearnIndex(next);
    } else if (hasDue) {
      setPhase("review");
    } else {
      fetchStats();
      setPhase("summary");
    }
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
      setQuizSubmitted(false);
      setQuizResult(null);
      setLearnIndex(0);
      setLearned(0);
      setPhase(null); // 交给上面的 effect 按新一轮重新定阶段
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

  if (phase === "learn" && currentWord) {
    return (
      <main className="min-h-full bg-surface-soft">
        <DrillHeader label="学新词" answered={learnIndex} total={words.length} />
        <div className="max-w-[880px] mx-auto px-4 py-10 pb-24 animate-fade-in">
          <WordFlashcard
            key={currentWord.id}
            word={currentWord}
            index={learnIndex}
            total={words.length}
            onGrade={handleGrade}
          />
        </div>
      </main>
    );
  }

  if (phase === "review") {
    return (
      <main className="min-h-full bg-surface-soft">
        <DrillHeader label="复习测验" answered={quiz.answeredCount} total={quiz.items.length} />
        <div className="max-w-[880px] mx-auto px-4 py-8 pb-24 animate-fade-in">
          <UnifiedPracticePanel session={quiz} levelLabel="今日复习" />
        </div>
      </main>
    );
  }

  const quizTotal = quizResult?.total ?? 0;
  return (
    <main className="min-h-full bg-surface-soft">
      <DrillHeader
        label="今日训练"
        answered={learned + (quizSubmitted ? quizTotal : 0)}
        total={learned + quizTotal}
      />
      <div className="max-w-[880px] mx-auto px-4 py-10 pb-24">
        <TrainSummary
          learnedCount={learned}
          quizTotal={quizTotal}
          quizCorrect={quizResult?.correct ?? 0}
          weakWords={quizResult?.weak ?? []}
          onRestart={handleExtraRound}
          restartLoading={extraLoading}
        />
      </div>
    </main>
  );
}
