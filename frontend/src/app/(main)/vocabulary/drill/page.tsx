"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useDailySession } from "@/hooks/useDailySession";
import { useVocabularyPractice } from "@/hooks/usePractice";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
import { WordFlashcard } from "@/components/vocabulary/WordFlashcard";
import { TrainSummary } from "@/components/vocabulary/TrainSummary";
import { FullPageSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";

/**
 * 全屏单词训练。
 * - 默认：百词斩式两段式「今日训练」——新词闪卡（学）→ 到期复习测验（练）→ 总结。
 * - ?video_id=：EndScreen「复习本视频生词」深链，保持纯测验行为（跳过闪卡阶段）。
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

/**
 * 今日训练主流程：闪卡学新词 → 到期词测验 → 总结。
 * 「再来一组」通过重挂载（key 变化）完全重置所有阶段状态。
 */
function DailyTraining() {
  const { session, loading, error, refresh } = useDailySession(true);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [learnIndex, setLearnIndex] = useState(0);
  const [learned, setLearned] = useState(0);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const fetchStats = useVocabularyStore((s) => s.fetchStats);

  const hasNew = (session?.newWords.length ?? 0) > 0;
  const hasDue = (session?.totals.due_total ?? 0) > 0;

  // 队列加载完成后决定起始阶段
  useEffect(() => {
    if (!session || phase) return;
    if (hasNew) setPhase("learn");
    else if (hasDue) setPhase("review");
    else setPhase("summary");
  }, [session, phase, hasNew, hasDue]);

  // 测验阶段：allGraded 后一次性提交成绩并进入总结
  const quiz = useVocabularyPractice({ count: 20, dueOnly: true, enabled: phase === "review" });

  useEffect(() => {
    if (phase !== "review" || !quiz.allGraded || quizSubmitted) return;
    setQuizSubmitted(true);
    quiz.submitResults().finally(() => {
      fetchStats();
      setPhase("summary");
    });
  }, [phase, quiz, quizSubmitted, fetchStats]);

  // 到期词在加载完成后的池子为空（竞态：到期队列刚被清空）→ 直接总结
  useEffect(() => {
    if (phase !== "review" || quiz.loading || quiz.error) return;
    if (quiz.items.length === 0) {
      fetchStats();
      setPhase("summary");
    }
  }, [phase, quiz.loading, quiz.error, quiz.items.length, fetchStats]);

  const newWords = session?.newWords ?? [];
  const currentWord = newWords[learnIndex] ?? null;

  /** 闪卡作答：记录 SM-2（认识=4，不认识=2），推进队列。 */
  function handleGrade(known: boolean) {
    if (!currentWord) return;
    api(`/api/v1/vocabulary/${currentWord.id}/review?quality=${known ? 4 : 2}`, {
      method: "POST",
    }).catch(() => toast.error(`「${currentWord.word}」学习记录同步失败`));

    const next = learnIndex + 1;
    setLearned((n) => n + 1);
    if (next < newWords.length) {
      setLearnIndex(next);
    } else if (hasDue) {
      setPhase("review");
    } else {
      fetchStats();
      setPhase("summary");
    }
  }

  const weakWords = useMemo(
    () =>
      quiz.items
        .map((item, i) => ({ item, g: quiz.graded[i] }))
        .filter(({ g }) => g && !g.correct)
        .map(({ item }) => ({ word: item.word, translation: item.answer ?? null })),
    [quiz.items, quiz.graded]
  );

  if (loading || !phase) {
    return (
      <main className="min-h-full bg-surface-soft">
        <DrillHeader label="今日训练" answered={0} total={0} />
        <FullPageSpinner />
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-full bg-surface-soft">
        <DrillHeader label="今日训练" answered={0} total={0} />
        <div className="max-w-[880px] mx-auto px-4 py-16">
          <ErrorState title={error} onRetry={refresh} />
        </div>
      </main>
    );
  }

  if (phase === "learn" && currentWord) {
    return (
      <main className="min-h-full bg-surface-soft">
        <DrillHeader label="学新词" answered={learnIndex} total={newWords.length} />
        <div className="max-w-[880px] mx-auto px-4 py-10 pb-24 animate-fade-in">
          <WordFlashcard
            key={currentWord.id}
            word={currentWord}
            index={learnIndex}
            total={newWords.length}
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

  return (
    <main className="min-h-full bg-surface-soft">
      <DrillHeader
        label="今日训练"
        answered={learned + (quizSubmitted ? quiz.items.length : 0)}
        total={learned + quiz.items.length}
      />
      <div className="max-w-[880px] mx-auto px-4 py-10 pb-24">
        <TrainSummary
          learnedCount={learned}
          quizTotal={quiz.items.length}
          quizCorrect={quiz.correctCount}
          weakWords={weakWords}
          onRestart={() => window.location.reload()}
        />
      </div>
    </main>
  );
}
