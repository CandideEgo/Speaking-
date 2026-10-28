"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { vocabularySource, partOfSpeechLabel } from "@/lib/vocabularyPresentation";
import { DictionaryMeaning } from "./DictionaryMeaning";
import { HighlightedSentence } from "./HighlightedSentence";
import { toastApiError } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { useSpeech } from "@/hooks/useSpeech";
import type { DailySession } from "@/hooks/useDailySession";
import type { VideoDetail, VocabularyPreferences, VocabularyWord } from "@/types";

export function VocabularyToday({
  session,
  stats,
  loading,
  error,
  onRetry,
  onQuotaSaved,
}: {
  session: DailySession | null;
  stats: { total: number; mastered: number };
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onQuotaSaved: (preferences: VocabularyPreferences) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const { speak } = useSpeech();
  const reviews = session?.reviewWords ?? [];
  const newWords = session?.newWords ?? [];
  const reviewLimit = Math.min(reviews.length, Math.max(3, 6 - newWords.length));
  const newLimit = Math.min(newWords.length, 6 - reviewLimit);
  const sources = useMemo(() => {
    const ids = new Set<string>();
    for (const word of [...(session?.reviewWords ?? []), ...(session?.newWords ?? [])]) {
      if (word.video_id) ids.add(word.video_id);
    }
    return [...ids];
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      sources.map(async (id) => {
        try {
          const video = await api<VideoDetail>(`/api/v1/videos/${id}`);
          return [id, video.title] as const;
        } catch {
          return [id, "来源视频"] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setTitles(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [sources]);

  async function saveQuota(value: number) {
    setSaving(true);
    try {
      onQuotaSaved(
        await api<VocabularyPreferences>("/api/v1/vocabulary/preferences", {
          method: "PUT",
          body: JSON.stringify({ daily_new_target: value }),
        })
      );
    } catch (err) {
      toastApiError(err, "配额保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState title="学习队列加载失败" message={error} onRetry={onRetry} />;
  if (loading || !session)
    return (
      <p role="status" className="py-10 text-muted">
        正在读取学习队列…
      </p>
    );
  if (stats.total === 0)
    return (
      <EmptyState
        icon={BookOpen}
        title="词库还是空的"
        description="去看一段视频，点字幕里的生词，再选择加入词库。单词会连同原句保存在这里。"
        action={<LinkButton href="/">去看视频</LinkButton>}
        className="py-14"
      />
    );

  const hasWords = reviews.length + newWords.length > 0;
  const label = session.activeSessionId ? "继续本轮" : reviews.length ? "开始本轮" : "学习新词";
  const groups: [string, VocabularyWord[]][] = [
    ["复习词", expanded ? reviews : reviews.slice(0, reviewLimit)],
    ["新词", expanded ? newWords : newWords.slice(0, newLimit)],
  ];
  return (
    <>
      <section
        className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-hairline py-5"
        aria-label="本轮任务"
      >
        <div>
          <h2 className="text-title font-semibold text-ink">
            {hasWords
              ? "先完成这一轮"
              : session.today.words_learned > 0
                ? "本轮已完成"
                : "暂无待练词汇"}
          </h2>
          {hasWords && (
            <p className="mt-2 text-copy text-body" data-testid="training-counts">
              本轮复习 {reviews.length} 个 · 新词 {newWords.length} 个
            </p>
          )}
          <p className="mt-2 text-meta text-muted">
            累计还有 {session.totals.due_total} 个到期词 · 今日已学 {session.today.words_learned}{" "}
            个词
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reviews.length > 0 && (
            <LinkButton href="/vocabulary/review" data-testid="start-review">
              开始复习
            </LinkButton>
          )}
          <LinkButton
            href={hasWords ? "/vocabulary/drill?start=1" : "/"}
            variant={reviews.length > 0 ? "outline" : "primary"}
          >
            {hasWords ? label : "去看视频"}
          </LinkButton>
        </div>
      </section>
      <div className="user-page-layout has-aside">
        <div className="user-page-main">
          {hasWords ? (
            <section aria-label="本轮词汇">
              <h2 className="user-sec-title">本轮词汇</h2>
              <p className="mt-2 text-meta text-muted">
                释义与原句供训练前浏览，进入训练后按题型作答。
              </p>
              {groups.map(
                ([title, words]) =>
                  words.length > 0 && (
                    <section key={title} className="mt-5" aria-label={title}>
                      <h3 className="text-copy font-semibold text-ink">{title}</h3>
                      <ul className="divide-y divide-hairline">
                        {words.map((word) => {
                          const source = vocabularySource(word, "vocabulary");
                          return (
                            <li key={word.id} className="py-5">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="text-title font-semibold text-ink">
                                  {word.word}
                                </strong>
                                {word.ipa && (
                                  <span className="font-mono text-meta text-muted">
                                    /{word.ipa.replace(/^\/+|\/+$/g, "")}/
                                  </span>
                                )}
                                {word.part_of_speech && (
                                  <span className="text-meta text-muted">
                                    {partOfSpeechLabel(word.part_of_speech)}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-label={`播放 ${word.word}`}
                                  onClick={() => speak(word.word, { rate: 0.9 })}
                                  className="rounded-sm p-2 text-muted hover:text-ink"
                                >
                                  <Volume2 size={16} />
                                </button>
                              </div>
                              <DictionaryMeaning
                                translation={word.translation}
                                definition={word.definition}
                                partOfSpeech={word.part_of_speech}
                              />
                              {word.context_sentence && (
                                <p className="mt-3 text-copy leading-relaxed text-body">
                                  <HighlightedSentence
                                    sentence={word.context_sentence}
                                    word={word.word}
                                  />
                                </p>
                              )}
                              {source && (
                                <Link
                                  href={source.href}
                                  className="mt-3 inline-block text-meta text-brand-700 hover:underline"
                                >
                                  {source.label}
                                  {word.video_id && titles[word.video_id]
                                    ? ` · ${titles[word.video_id]}`
                                    : ""}
                                </Link>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )
              )}
              {!expanded && reviews.length + newWords.length > 6 && (
                <Button variant="outline" onClick={() => setExpanded(true)}>
                  展开本轮全部 {reviews.length + newWords.length} 个词
                </Button>
              )}
            </section>
          ) : (
            <p className="text-copy text-body">去听一点新内容，之后再回来复习。</p>
          )}
        </div>
        <aside className="user-page-aside" aria-label="学习设置">
          <section className="user-aside-sec">
            <h2 className="user-aside-title">学习设置</h2>
            <label className="block text-meta text-muted">
              每日新词
              <select
                aria-label="每日新词"
                value={session.preferences?.daily_new_target ?? 10}
                disabled={saving || loading}
                onChange={(e) => void saveQuota(Number(e.target.value))}
                className="mt-2 block w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-copy text-ink"
              >
                {[...new Set([5, 10, 20, 30, 50, 100, session.preferences?.daily_new_target ?? 10])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n} 个
                    </option>
                  ))}
              </select>
            </label>
            <p className="mt-3 text-meta text-muted">
              配额用于安排新一轮；已开始的轮次保持原有数量。
            </p>
          </section>
          <section className="user-aside-sec">
            <h2 className="user-aside-title">词库</h2>
            <p className="text-meta text-muted">
              共 {stats.total} 词 · 已掌握 {stats.mastered} 词
            </p>
            <Link
              href="/vocabulary/sets"
              className="mt-3 inline-block text-copy font-semibold text-ink hover:text-brand-700"
            >
              按词单查看 →
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
