"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, X } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useVocabSieve } from "@/hooks/useVocabSieve";
import { useVocabSetDetail } from "@/hooks/useVocabSetDetail";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import { VocabWordAction, VocabWordCard } from "@/components/vocabulary/VocabWordCard";
import { HighlightedSentence } from "@/components/vocabulary/HighlightedSentence";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/LinkButton";
import { watchSentenceHref } from "@/lib/watchEntry";
import { dictionaryPreview, partOfSpeechLabel } from "@/lib/vocabularyPresentation";

/**
 * 快速过筛（全屏沉浸，壳层对齐 /vocabulary/drill）：
 * 逐个单词自评「会 / 不会」，每次判定 POST 后重拉筛词状态 ——
 * 服务端为唯一事实来源，中途退出/刷新可从断点续筛。
 */
export default function VocabSievePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const { state, loading, error, judging, judge, markLearned, reload } = useVocabSieve(
    id,
    isAuthenticated && !isLoading
  );
  // 待学清单阶段的词表（unknown），只在需要时拉取。
  const inSievePass = !!state?.set_word_id;
  const needsUnknownList = !!state && !state.completed && !inSievePass;
  const {
    detail: unknownDetail,
    loading: unknownLoading,
    error: unknownError,
    reload: reloadUnknownList,
  } = useVocabSetDetail(id, "learning", isAuthenticated && !isLoading && needsUnknownList);
  // 判定卡要展示原句与来源句：集合全量词表另拉一份（只在过筛阶段启用）。
  const { detail: allDetail } = useVocabSetDetail(
    id,
    "all",
    isAuthenticated && !isLoading && !!state && !state.completed
  );
  const unknownWords = unknownDetail?.words ?? null;
  // 两阶段：第一遍过筛（pending）→ 待学清单（unknown）→ 标记已掌握闭环。
  const inPendingList = !inSievePass && (state?.unknown_count ?? 0) > 0;

  // 键盘 shortcut：1=不会 / 2=会（←/→ 同义），判定飞行中忽略。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (judging || !state || state.completed || !state.set_word_id) return;
      if (e.key === "1" || e.key === "ArrowLeft") void handleJudge(false);
      else if (e.key === "2" || e.key === "ArrowRight") void handleJudge(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, judging, judge]);

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  const total = state?.total ?? 0;
  const sieved = state?.sieved_count ?? 0;
  const pct = total > 0 ? Math.round((sieved / total) * 100) : 0;
  const currentWordInfo = allDetail?.words.find(
    (w) => w.word.toLowerCase() === (state?.word?.word ?? "").toLowerCase()
  );
  // 词典释义按词性挑一行、按逗号收成一句；完整释义收在可展开里，
  // 免得一张自评卡被多行词典内容撑开。
  const currentMeaning = state?.word
    ? dictionaryPreview(state.word.translation, state.word.definition, state.word.part_of_speech)
    : null;
  const currentPos = partOfSpeechLabel(state?.word?.part_of_speech);

  async function handleJudge(known: boolean) {
    try {
      await judge(known);
    } catch {
      toast.error("保存失败，请重试");
    }
  }

  async function handleMarkLearned(setWordId: string) {
    try {
      await markLearned(setWordId);
      toast.success("已标记为掌握");
      // 刷新待学清单：POST 返回时后端已提交，reload 后该词立即从列表移除，
      // 最后一个词学完时 sieve state 切到完成态（否则用户会以为点击未生效）。
      reloadUnknownList();
    } catch {
      toast.error("保存失败，请重试");
    }
  }

  // 进度随判定逐词落库（服务端），退出无需确认，toast 提示断点。
  function handleExit() {
    if (state && !state.completed && inSievePass) {
      toast(`已保存，下次从第 ${state.sieved_count + 1} 个继续`);
    }
    router.push(`/vocabulary/sets/${id}`);
  }

  return (
    <div className="min-h-full bg-surface-soft">
      {/* Sieve header（sticky，对齐 drill 页壳层） */}
      <div className="sticky top-0 z-30 bg-canvas/92 backdrop-blur border-b border-hairline">
        <div className="max-w-[880px] mx-auto flex items-center gap-3.5 px-4 py-3">
          <button
            onClick={handleExit}
            aria-label="退出筛词"
            className="inline-flex h-[34px] items-center gap-1.5 rounded-sm border border-hairline px-2.5 text-meta font-semibold text-ink transition-colors hover:border-ink flex-shrink-0 cursor-pointer"
          >
            <X size={15} />
            <span className="hidden sm:inline">退出筛词</span>
          </button>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface-card text-copy font-semibold text-ink flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            快速筛词
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-card overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            data-testid="sieve-progress"
            className="text-meta text-muted font-mono flex-shrink-0 tabular-nums"
          >
            {sieved}/{total}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="user-page max-w-[880px] mx-auto">
        {loading && !state ? (
          <div className="flex justify-center py-20">
            <InlineSpinner />
          </div>
        ) : error && !state ? (
          <ErrorState title={error} onRetry={reload} className="py-16" />
        ) : state?.completed ? (
          /* 完成态：100% mastered */
          <div className="flex flex-col items-center text-center py-10">
            <span className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center">
              <CheckCircle2 size={32} className="text-success-text" />
            </span>
            <p className="text-meta font-bold tracking-[0.1em] text-muted mt-4">闭环完成</p>
            <h2 className="text-title font-extrabold tracking-tight text-ink mt-1">本集合已学完</h2>
            <p className="text-copy text-muted mt-1.5 tabular-nums">
              已掌握 {total}/{total} · 全部标为已掌握
            </p>
            <p className="text-meta leading-relaxed text-muted mt-2 max-w-[34rem]">
              判定已保存：标为「会」的词不再进训练队列。想继续练，去今天到期的词或换一个词单。
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-8">
              <Link
                href={`/vocabulary/sets/${id}`}
                className="px-5 py-2.5 rounded-sm bg-canvas text-ink border border-hairline text-copy font-semibold hover:border-ink hover:bg-surface-soft transition-all"
              >
                返回集合
              </Link>
              <LinkButton href="/vocabulary" size="md" className="px-5">
                去复习今天到期的词
              </LinkButton>
              <Link
                href="/"
                className="px-5 py-2.5 rounded-sm bg-canvas text-ink border border-hairline text-copy font-semibold hover:border-ink hover:bg-surface-soft transition-all"
              >
                去找新视频
              </Link>
            </div>
          </div>
        ) : inPendingList ? (
          /* 待学清单阶段：第一遍过筛完成，剩下的「不会」词逐个学掉 */
          <>
            <div className="text-center mb-6">
              <p className="text-meta font-bold tracking-[0.1em] text-muted">第一遍过筛完成</p>
              <h2 className="text-copy-lg font-extrabold tracking-tight text-ink mt-1">待学清单</h2>
              <p className="text-copy text-muted mt-1.5 tabular-nums">
                保留了 {state?.unknown_count ?? 0} 个词 · 会 {state?.mastered_count ?? 0}{" "}
                个已移出训练队列
              </p>
              <p className="text-meta text-muted mt-1">
                把这 {state?.unknown_count ?? 0} 个词学完即闭环；标为「会」的词不再进训练队列。
              </p>
            </div>
            {/* 待学清单：与集合详情同款词卡（两栏），动作统一走 VocabWordAction。
                先报错、再加载中：detail 在出错时被置空，没有 detail 就没有清单可渲染 ——
                否则「请求已失败/尚未返回」会渲染成一张空网格，与上方「还有 N 个词要学」矛盾。 */}
            {unknownError && !unknownDetail ? (
              <ErrorState title={unknownError} onRetry={reloadUnknownList} className="py-10" />
            ) : unknownLoading || !unknownDetail ? (
              <div className="flex justify-center py-16">
                <InlineSpinner />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {(unknownWords ?? []).map((w) => (
                  <VocabWordCard
                    key={w.set_word_id}
                    word={w.word}
                    ipa={w.ipa}
                    partOfSpeech={w.part_of_speech}
                    meaning={w.translation || w.definition || "—"}
                    actions={
                      <VocabWordAction
                        tone="success"
                        testId="mark-learned"
                        disabled={judging}
                        ariaLabel={`把 ${w.word} 标记为已学会`}
                        onClick={() => handleMarkLearned(w.set_word_id)}
                      >
                        我已学会
                      </VocabWordAction>
                    }
                  />
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={`/vocabulary/sets/${id}`}
                className="px-5 py-2.5 rounded-sm bg-canvas text-ink border border-hairline text-copy font-semibold hover:border-ink hover:bg-surface-soft transition-all"
              >
                返回集合
              </Link>
              <LinkButton href="/vocabulary/drill" size="md" className="px-5">
                开始今日训练
              </LinkButton>
              <Link
                href="/vocabulary"
                className="px-5 py-2.5 rounded-sm bg-canvas text-ink border border-hairline text-copy font-semibold hover:border-ink hover:bg-surface-soft transition-all"
              >
                去复习今天到期的词
              </Link>
            </div>
          </>
        ) : state?.word ? (
          <>
            {/* 当前单词卡：与训练选择题卡同款（rounded-lg + shadow-lift） */}
            <Card padding={0} className="shadow-lift px-6 py-10 text-center">
              <p className="display-lg text-ink">{state.word.word}</p>
              {state.word.ipa && (
                <p className="text-copy text-muted font-mono mt-2">{state.word.ipa}</p>
              )}
              <p className="text-copy text-body mt-4">
                {currentPos && <span className="text-muted italic mr-1.5">{currentPos}</span>}
                {currentMeaning?.summary || "—"}
              </p>
              {currentMeaning?.expandable && (
                <details className="mt-2 text-left">
                  <summary className="cursor-pointer text-meta text-muted hover:text-ink">
                    完整词典释义
                  </summary>
                  <p className="mt-1 whitespace-pre-line text-meta leading-relaxed text-muted">
                    {currentMeaning.full}
                  </p>
                </details>
              )}
              {currentWordInfo?.context_sentence && (
                <div className="text-left mt-6 pt-5 border-t border-hairline-soft">
                  <p className="text-copy leading-relaxed text-muted">
                    “
                    <HighlightedSentence
                      sentence={currentWordInfo.context_sentence}
                      word={state.word.word}
                    />
                    ”
                  </p>
                  {currentWordInfo.video_id && currentWordInfo.subtitle_id && (
                    <Link
                      href={watchSentenceHref(
                        currentWordInfo.video_id,
                        { from: "set", extra: { set: id } },
                        {
                          subtitleId: currentWordInfo.subtitle_id,
                          startTime: currentWordInfo.start_time,
                          word: state.word.word,
                        }
                      )}
                      className="mt-2 inline-flex items-center gap-1 text-meta text-brand-700 hover:underline"
                    >
                      回到原句 ↗
                    </Link>
                  )}
                </div>
              )}
            </Card>

            {/* 判定按钮：会/不会 是二选一的自评，没有对错之分，所以两边等重。
                原来是「会」实心绿 +「不会」警告色软底，等于暗示「会」才是正确答案，
                连点过筛时会被推着往「会」上点。 */}
            <div className="flex gap-3 mt-6">
              <button
                data-testid="sieve-unknown"
                onClick={() => handleJudge(false)}
                disabled={judging}
                className="flex-1 py-3.5 rounded-md bg-canvas border border-hairline text-ink text-copy-lg font-bold hover:border-warning-text hover:bg-warning-soft hover:text-warning-text transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                不会
              </button>
              <button
                data-testid="sieve-known"
                onClick={() => handleJudge(true)}
                disabled={judging}
                className="flex-1 py-3.5 rounded-md bg-canvas border border-success/40 text-success-text text-copy-lg font-bold hover:bg-success hover:text-on-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                会
              </button>
            </div>
            <p className="text-center text-meta text-muted mt-3">
              按 <kbd className="font-mono">1</kbd> 标记不会 · 按 <kbd className="font-mono">2</kbd>{" "}
              标记会
            </p>
            <p
              className="text-center text-meta text-muted mt-4 tabular-nums"
              aria-live="polite"
              data-testid="sieve-tally"
            >
              会 {state.mastered_count} · 不会 {state.unknown_count} · 未判 {state.pending_count}
            </p>
            <p className="text-center text-meta text-muted mt-1">
              筛词规则：不会 → 进待学清单；会 → 不再进训练队列。
            </p>
          </>
        ) : (
          <ErrorState title="没有待过筛的单词" onRetry={reload} className="py-16" />
        )}

        {/* 判定中指示 */}
        {judging && (
          <div className="mt-6 flex justify-center">
            <InlineSpinner />
          </div>
        )}
      </div>
    </div>
  );
}
