"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useDailySession } from "@/hooks/useDailySession";
import { useStudySession } from "@/hooks/useStudySession";
import { useVocabularyPractice } from "@/hooks/usePractice";
import { api } from "@/lib/api";
import { vocabularySource, partOfSpeechLabel } from "@/lib/vocabularyPresentation";
import { DictionaryMeaning } from "@/components/vocabulary/DictionaryMeaning";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
import { WordQuizCard } from "@/components/vocabulary/WordFlashcard";
import { TrainSummary, type WeakWord } from "@/components/vocabulary/TrainSummary";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
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
  questionKindForAppearance,
  type DrillQuestion,
} from "@/lib/drillQuestions";
import type { VocabularyWord } from "@/types";

/**
 * 全屏单词训练。
 * - 默认：先进入「今日训练」入口页（本次要练的词 / 三种题型 / 训练口径），
 *   再开始一条全程选择题循环（S5）——本轮新词按出现间隔反复出题、连对两次
 *   毕业，到期复习词追加在队尾各问一次。调度规则在 `lib/drillRound.ts`（纯函数）。
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
  if (searchParams.get("review_count") === "5") {
    return <QuickReview />;
  }
  return <DailyTraining />;
}

/**
 * Drill header：退出 + 页面名 + 本轮进度 + 进度条。
 *
 * 进度按「本轮单词」而不是「题目」算：一个词要连对两次才毕业、答错还会重插，
 * 一轮的题目总数一直在变，拿它当分母进度条只会乱跳。右侧计数器的口径由调用方
 * 用 `progressLabel` 说明（每日训练是「本轮」，深链测验是「已答」）。
 */
function DrillHeader({
  label,
  progressLabel,
  done,
  total,
}: {
  label: string;
  progressLabel: string;
  done: number;
  total: number;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const router = useRouter();
  return (
    <div className="sticky top-0 z-30 bg-canvas/92 backdrop-blur border-b border-hairline">
      <div className="max-w-[880px] mx-auto flex items-center gap-3.5 px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/vocabulary")}
          aria-label="退出训练"
          className="inline-flex h-[34px] items-center gap-1.5 rounded-sm border border-hairline px-2.5 text-meta font-semibold text-ink transition-colors hover:border-ink flex-shrink-0 cursor-pointer"
        >
          <X size={15} />
          <span className="hidden sm:inline">退出训练</span>
        </button>
        <span className="text-copy font-semibold text-ink flex-shrink-0">{label}</span>
        <div className="flex-1 min-w-0 h-1.5 rounded-full bg-surface-card overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-meta text-muted flex-shrink-0 tabular-nums">
          {progressLabel}{" "}
          <span className="font-mono">
            {done}/{total}
          </span>
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
    <div className="min-h-full bg-surface-soft">
      <DrillHeader label="本视频生词" progressLabel="已答" done={answered} total={total} />
      <div className="user-page max-w-[880px] mx-auto">
        <UnifiedPracticePanel session={session} levelLabel="单词训练" />
      </div>
    </div>
  );
}

/** 首页的小轮复习：只取最多 5 个到期词，不修改今日训练配额。 */
function QuickReview() {
  const session = useVocabularyPractice({ count: 5, dueOnly: true });
  return (
    <div className="min-h-full bg-surface-soft">
      <DrillHeader
        label="到期词小复习"
        progressLabel="已答"
        done={session.answeredCount}
        total={session.items.length}
      />
      <div className="user-page max-w-[880px] mx-auto">
        {!session.loading && !session.error && session.items.length === 0 ? (
          <div className="space-y-3 text-copy text-body">
            <p>今天没有到期词，去听一点新内容吧。</p>
            <Link href="/" className="text-brand-700 underline">
              返回首页
            </Link>
          </div>
        ) : (
          <UnifiedPracticePanel session={session} levelLabel="到期词复习" />
        )}
      </div>
    </div>
  );
}

type Phase = "drill" | "summary";

/** 复习词结果攒批阈值：20 词的今日目标 ≤ 4 次 POST，远离 practice/submit 的 10/min 限流。 */
const REVIEW_FLUSH_SIZE = 5;

/**
 * 今日训练主流程：入口页 → 一条全程选择题循环 → 小结。
 *
 * 队列 = 本轮未毕业的新词（每答一题写回 `study_sessions`：连对计数、毕业）
 * + 到期复习词（`daily-session` 的 review_words，各问一次，走批量提交端点）。
 * 调度（出现间隔、毕业、续轮推导）与题型轮换都在 `lib/` 的纯函数里，
 * 本组件只负责落库与推进。中途刷新：新词进度从落库状态续上，已答过的复习词
 * 因后端更新 `next_review_at` 自然退出到期队列（复习词结果攒批提交，未 flush
 * 的批次刷新后会重现，属已知小窗口）。
 */
function DailyTraining() {
  const daily = useDailySession(true);
  const round = useStudySession(true);
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [sched, setSched] = useState<DrillSchedulerState | null>(null);
  const [pool, setPool] = useState<VocabularyWord[]>([]);
  const [question, setQuestion] = useState<DrillQuestion | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [progress, setProgress] = useState({ learned: 0, asked: 0, correct: 0, done: 0 });
  const [weak, setWeak] = useState<WeakWord[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const fetchStats = useVocabularyStore((s) => s.fetchStats);
  const vocabStats = useVocabularyStore((s) => s.stats);

  // 到期复习词结果缓冲（practice/submit 限流 10/min，逐题 POST 快速作答会 429
  // 且失败不落库）。攒批到 REVIEW_FLUSH_SIZE 或阶段收尾时一次性批量提交。
  const pendingReview = useRef<{ word: string; correct: boolean }[]>([]);
  const flushingRef = useRef(false);
  const flushPendingReview = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      while (pendingReview.current.length > 0) {
        const batch = pendingReview.current.splice(0);
        try {
          await api("/api/v1/vocabulary/practice/submit", {
            method: "POST",
            body: JSON.stringify({ results: batch }),
          });
        } catch {
          toast.error(`学习记录同步失败（${batch.length} 词），本轮这些词不会计入复习进度`);
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  useEffect(() => () => void flushPendingReview(), [flushPendingReview]);

  const loading = round.loading || daily.loading;
  const error = round.error ?? daily.error;

  // 入口页预览：到期复习词在前，本轮新词在后（与建队口径一致，去重）。
  const previewWords = useMemo(() => {
    const rows: VocabularyWord[] = [];
    const seen = new Set<string>();
    for (const word of daily.session?.reviewWords ?? []) {
      if (!seen.has(word.id)) {
        seen.add(word.id);
        rows.push(word);
      }
    }
    for (const item of round.round?.items ?? []) {
      if (item.word && !seen.has(item.word.id)) {
        seen.add(item.word.id);
        rows.push(item.word);
      }
    }
    return rows;
  }, [daily.session?.reviewWords, round.round?.items]);

  // 轮次与到期词就绪后一次性建队（加练开新轮时 sched 已被置空，走同一入口）。
  useEffect(() => {
    if (!started || loading || error || phase || sched) return;
    const state = buildDrillScheduler(round.round?.items ?? [], daily.session?.reviewWords ?? []);
    setSched(state);
    setPool(poolFromState(state));
    setPhase(state.entries.length > 0 ? "drill" : "summary");
  }, [started, loading, error, phase, sched, round.round, daily.session]);

  // 没有可练的词时不必停在入口页（直接给「今天的词都练完了」小结）。
  useEffect(() => {
    if (!loading && !error && !started && previewWords.length === 0) setStarted(true);
  }, [loading, error, started, previewWords.length]);

  // 队首出题：按出现次序定题型，从词池造选项。构造失败（词池太小）则跳过该词。
  // 只在「记一次作答」时改 sched——反馈展示期间队列不动，「下一个」点了才推进。
  useEffect(() => {
    if (phase !== "drill" || !sched) return;
    const entry = currentEntry(sched);
    if (!entry) {
      void flushPendingReview();
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
  }, [phase, sched, pool, fetchStats, flushPendingReview]);

  /** 记一次作答：本地调度不动（等「下一个」），落库异步跟随。 */
  function recordAnswer(correct: boolean) {
    const entry = sched ? currentEntry(sched) : null;
    if (!entry) return;
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
      // 先进缓冲，攒够或收尾时批量提交——逐题 POST 会撞端点限流。
      pendingReview.current.push({ word: entry.word.word, correct });
      if (pendingReview.current.length >= REVIEW_FLUSH_SIZE) {
        void flushPendingReview();
      }
    }
  }

  function handleAnswer(correct: boolean) {
    if (lastCorrect !== null) return;
    recordAnswer(correct);
    setLastCorrect(correct);
  }

  /** 「下一个」：出队 + 按间隔重插（调度规则在 lib/drillRound.ts）。 */
  function handleNext() {
    if (!sched || lastCorrect === null) return;
    const outcome = applyAnswer(sched, lastCorrect);
    setProgress((p) => ({ ...p, done: p.done + (outcome.done ? 1 : 0) }));
    setSched(outcome.state);
    setLastCorrect(null);
  }

  /** 「跳过」：记为未答对（稍后还会再问一次）并立即推进，不必先选答案。 */
  function handleSkip() {
    if (!sched || lastCorrect !== null) return;
    if (!currentEntry(sched)) return;
    recordAnswer(false);
    const outcome = applyAnswer(sched, false);
    setProgress((p) => ({ ...p, done: p.done + (outcome.done ? 1 : 0) }));
    setSched(outcome.state);
    setLastCorrect(null);
    toast("已跳过，这个词稍后会再问一次");
  }

  function handleExit() {
    void flushPendingReview();
    router.push("/vocabulary");
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
      // 缓冲里的结果先落库，否则 refresh 会把已答过的词再拉回来。
      await flushPendingReview();
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
      <div className="min-h-full bg-surface-soft">
        <DrillHeader label="今日训练" progressLabel="本轮" done={0} total={0} />
        <div className="max-w-[880px] mx-auto px-4 py-16">
          <ErrorState title={error} onRetry={round.reload} />
        </div>
      </div>
    );
  }

  if (loading || !started) {
    if (loading)
      return (
        <div className="min-h-full bg-surface-soft">
          <DrillHeader label="今日训练" progressLabel="本轮" done={0} total={0} />
          <FullPageSpinner />
        </div>
      );
    return (
      <DrillIntro
        words={previewWords}
        reviewCount={daily.session?.reviewWords.length ?? 0}
        expanded={previewExpanded}
        onToggleExpand={() => setPreviewExpanded((v) => !v)}
        onStart={() => setStarted(true)}
        stats={vocabStats}
      />
    );
  }

  if (!phase) {
    return (
      <div className="min-h-full bg-surface-soft">
        <DrillHeader label="今日训练" progressLabel="本轮" done={0} total={0} />
        <FullPageSpinner />
      </div>
    );
  }

  // 本轮单词总数：建队时的词池快照。一个词要连对两次才毕业、答错会重插，
  // 所以这是分母（词），不是题数。
  const roundTotal = Math.max(pool.length, progress.done, 1);

  if (phase === "drill") {
    return (
      <div className="min-h-full bg-surface-soft">
        <DrillHeader
          label="今日训练"
          progressLabel="本轮"
          done={progress.done}
          total={roundTotal}
        />
        <div className="user-page max-w-[880px] mx-auto animate-fade-in">
          {question ? (
            <WordQuizCard
              key={`${question.vocabularyId}-${question.kind}-${question.answer}`}
              question={question}
              onAnswer={handleAnswer}
              onNext={handleNext}
              onSkip={handleSkip}
              onExit={handleExit}
            />
          ) : (
            <FullPageSpinner />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface-soft">
      <DrillHeader label="今日训练" progressLabel="本轮" done={progress.done} total={roundTotal} />
      <div className="user-page max-w-[880px] mx-auto">
        <TrainSummary
          learnedCount={progress.learned}
          quizTotal={progress.asked}
          quizCorrect={progress.correct}
          weakWords={weak}
          onRestart={handleExtraRound}
          restartLoading={extraLoading}
        />
      </div>
    </div>
  );
}

/** 今日训练入口页（设计 drill.html 未带 ?start=1 的那一屏）。 */
function DrillIntro({
  words,
  reviewCount,
  expanded,
  onToggleExpand,
  onStart,
  stats,
}: {
  words: VocabularyWord[];
  reviewCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onStart: () => void;
  stats: { total?: number; due_count?: number; mastered_count?: number };
}) {
  const router = useRouter();
  const visible = expanded ? words : words.slice(0, 8);
  const later = Math.max(
    0,
    (stats.total ?? 0) - (stats.due_count ?? 0) - (stats.mastered_count ?? 0)
  );
  const levelLabel = (level: string | null | undefined) => {
    if (!level) return null;
    const labels: Record<string, string> = {
      cet4: "四级",
      cet6: "六级",
      kaoyan: "考研",
      ielts: "雅思",
    };
    return labels[level] || level.toUpperCase();
  };

  return (
    <div className="bg-canvas">
      <div className="user-page">
        <PageHeader
          crumb="词汇 · 训练"
          title={words.length ? `本轮训练 · ${words.length} 个词` : "今日训练"}
          description="认词、巩固、听音选词三种题型轮换；答错或跳过的词会再问一次。随时可以退出。"
          actions={
            <>
              <Link href="/vocabulary" className="text-copy text-muted hover:text-ink">
                回到词汇
              </Link>
              <Button size="md" onClick={onStart}>
                开始训练（{words.length} 个词）
              </Button>
            </>
          }
        />
        <div className="user-page-layout has-aside mt-2">
          <div className="user-page-main">
            <section aria-labelledby="drill-words-title">
              <div className="user-sec-head">
                <h2 id="drill-words-title" className="user-sec-title">
                  本次要练的 {words.length} 个词
                </h2>
                <span className="user-sec-sub">
                  {`本轮复习 ${reviewCount} 个 · 新词 ${words.length - reviewCount} 个`}
                </span>
              </div>
              <p className="mt-3 text-meta leading-relaxed text-muted">
                累计到期 {stats.due_count ?? 0} 个；本轮取 {reviewCount} 个复习词，另含{" "}
                {words.length - reviewCount} 个新词。当前展示 {visible.length}/{words.length}{" "}
                个，其余到期词留待后续轮次。
              </p>
              <ul className="mt-1 divide-y divide-hairline">
                {visible.map((word) => {
                  const level = levelLabel(word.difficulty_level);
                  const source = vocabularySource(word, "drill");
                  return (
                    <li key={word.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-copy-lg font-bold text-ink">{word.word}</span>
                          {word.ipa && (
                            <span className="font-mono text-meta text-muted">{word.ipa}</span>
                          )}
                          {word.part_of_speech && (
                            <span className="text-meta text-muted">
                              {partOfSpeechLabel(word.part_of_speech)}
                            </span>
                          )}
                          {level && (
                            <details className="text-meta text-muted">
                              <summary className="cursor-pointer">考试标签</summary>
                              <span>{level}</span>
                            </details>
                          )}
                        </div>
                        <DictionaryMeaning
                          translation={word.translation}
                          definition={word.definition}
                          partOfSpeech={word.part_of_speech}
                        />
                      </div>
                      {source && (
                        <Link
                          href={source.href}
                          className="flex-none pt-1 text-meta text-brand-700 hover:underline"
                        >
                          {source.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
              {words.length > 8 && !expanded && (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="mt-3 inline-flex items-center rounded-sm border border-hairline px-3 py-1.5 text-meta font-semibold text-ink hover:border-ink cursor-pointer"
                >
                  展开其余 {words.length - 8} 个词
                </button>
              )}
            </section>

            <section aria-labelledby="drill-how-title" className="mt-8">
              <div className="user-sec-head">
                <h2 id="drill-how-title" className="user-sec-title">
                  这一轮怎么练
                </h2>
                <span className="user-sec-sub">三种题型轮换</span>
              </div>
              <div className="user-kv mt-3">
                <div className="user-kv-row">
                  <span className="user-kv-key">认词</span>
                  <span className="user-kv-val">看单词与音标，选出正确词义</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">巩固</span>
                  <span className="user-kv-val">看中文词义，选出对应的英文单词</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">听音选词</span>
                  <span className="user-kv-val">听发音，选出你听到的词</span>
                </div>
              </div>
              <p className="mt-3 text-meta leading-relaxed text-muted">
                答错的词会再次出现，连续答对两次即完成本轮学习；也可以跳过，稍后再练。
              </p>
            </section>
          </div>

          <aside className="user-page-aside" aria-label="复习队列与说明">
            <section className="user-aside-sec">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="user-aside-title">复习队列</h2>
                <span className="text-meta text-muted tabular-nums">{stats.total ?? 0} 词</span>
              </div>
              <div className="user-kv">
                <div className="user-kv-row">
                  <span className="user-kv-key">今天到期</span>
                  <span className="user-kv-val text-brand-700">{stats.due_count ?? 0}</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">之后几天</span>
                  <span className="user-kv-val">{later}</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">已掌握</span>
                  <span className="user-kv-val">{stats.mastered_count ?? 0}</span>
                </div>
              </div>
            </section>
            <section className="user-aside-sec">
              <h2 className="user-aside-title">说明</h2>
              <p className="text-meta leading-relaxed text-muted">
                学习进度会自动保存，下次可以接着练。
              </p>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="mt-3 inline-block text-copy font-semibold text-ink hover:text-brand-700 cursor-pointer"
              >
                去观看页找新词 →
              </button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
