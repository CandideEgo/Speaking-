"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { watchHref } from "@/lib/watchEntry";
import { vocabularySource, partOfSpeechLabel } from "@/lib/vocabularyPresentation";
import { DictionaryMeaning } from "@/components/vocabulary/DictionaryMeaning";
import { toastApiError } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { BookOpen, Volume2 } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";
import { HighlightedSentence } from "@/components/vocabulary/HighlightedSentence";
import type { DailySession } from "@/hooks/useDailySession";
import type { Paginated, VideoDetail, VocabularyPreferences, VocabularyWord } from "@/types";

/** 等级徽标文案：设计里四级/六级/考研/雅思用中文档位，其余（A1–C2）原样。 */
const LEVEL_LABEL: Record<string, string> = {
  cet4: "四级",
  cet6: "六级",
  kaoyan: "考研",
  ielts: "雅思",
};

function levelLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  return LEVEL_LABEL[level] || level.toUpperCase();
}

/** `ipa` 已带斜杠（后端 `"/ˈhezɪteɪt/"`）时不再包一层，避免出现 `//…//`。 */
function ipaText(ipa: string | null | undefined): string | null {
  if (!ipa) return null;
  const value = ipa.trim();
  if (!value) return null;
  if (value.startsWith("/") && value.endsWith("/")) return value;
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

/**
 * 下一批复习时间（设计 none 态「下一批 明天 09:00 · 12 个」）。
 * 产品没有「排程」接口，改为取词库第一页里最近的 `next_review_at`，只作信息提示；
 * 取不到就不显示这一行，不编造时间。
 */
function formatBatch(iso: string): string {
  const target = new Date(iso);
  const time = target.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const now = new Date();
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(target) - dayStart(now)) / 86_400_000);
  if (diffDays === 0) return `今天 ${time}`;
  if (diffDays === 1) return `明天 ${time}`;
  return `${target.getMonth() + 1} 月 ${target.getDate()} 日 ${time}`;
}

interface NextBatch {
  label: string;
  count: number;
}

export function VocabularyToday({
  session,
  stats,
  loading,
  onQuotaSaved,
}: {
  session: DailySession | null;
  stats: { total: number; due: number; mastered: number };
  loading: boolean;
  onQuotaSaved: (p: VocabularyPreferences) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceTitles, setSourceTitles] = useState<Record<string, string>>({});
  const [nextBatch, setNextBatch] = useState<NextBatch | null>(null);
  const { speak } = useSpeech();
  const words = useMemo(
    () => (session?.reviewWords.length ? session.reviewWords : (session?.newWords ?? [])),
    [session?.reviewWords, session?.newWords]
  );
  const visible = expanded ? words : words.slice(0, 6);
  const noneState = !loading && stats.total > 0 && stats.due === 0;
  const emptyState = !loading && stats.total === 0;
  const later = Math.max(0, stats.total - stats.due - stats.mastered);

  // 「这批预览词从哪来」：按 video_id 聚合当日队列里的词，再补视频标题。
  const videoIds = useMemo(
    () => Array.from(new Set(words.map((w) => w.video_id).filter((id): id is string => !!id))),
    [words]
  );
  const videoIdsKey = videoIds.join(",");
  useEffect(() => {
    const ids = videoIdsKey ? videoIdsKey.split(",") : [];
    if (!ids.length) {
      setSourceTitles({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const video = await api<VideoDetail>(`/api/v1/videos/${id}`);
            return [id, video.title] as const;
          } catch {
            return [id, "来源视频"] as const;
          }
        })
      );
      if (!cancelled) setSourceTitles(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [videoIdsKey]);

  // none 态「下一批」：词库第一页里最近一次到期时间，取不到就不显示。
  useEffect(() => {
    if (!noneState) {
      setNextBatch(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<Paginated<VocabularyWord>>(
          "/api/v1/vocabulary?page=1&page_size=100"
        );
        const upcoming = data.items
          .filter((w) => w.next_review_at && new Date(w.next_review_at).getTime() > Date.now())
          .map((w) => new Date(w.next_review_at as string).getTime())
          .sort((a, b) => a - b);
        if (!upcoming.length) {
          if (!cancelled) setNextBatch(null);
          return;
        }
        const earliest = upcoming[0];
        const earliestDay = new Date(earliest).toDateString();
        const count = upcoming.filter((t) => new Date(t).toDateString() === earliestDay).length;
        if (!cancelled)
          setNextBatch({ label: formatBatch(new Date(earliest).toISOString()), count });
      } catch {
        if (!cancelled) setNextBatch(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noneState, stats.due]);

  const sourceRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const word of words) {
      if (!word.video_id) continue;
      counts.set(word.video_id, (counts.get(word.video_id) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([videoId, count]) => ({
      videoId,
      count,
      title: sourceTitles[videoId] ?? "来源视频",
    }));
  }, [words, sourceTitles]);

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

  return (
    <div className="user-page-layout has-aside">
      <div className="user-page-main">
        {loading ? (
          <p role="status" className="py-10 text-muted">
            正在读取学习队列…
          </p>
        ) : emptyState ? (
          <EmptyGuide />
        ) : (
          <section aria-labelledby="vocab-list-title">
            <div className="user-sec-head">
              <h2 id="vocab-list-title" className="user-sec-title">
                {noneState ? "接下来可以记的词" : "本轮复习词预览"}
              </h2>
              <span className="user-sec-sub">
                {noneState
                  ? nextBatch
                    ? `下一批 ${nextBatch.label} · ${nextBatch.count} 个`
                    : "今天没有到期词"
                  : `预览 ${words.length} 个 · 来自 ${sourceRows.length} 段视频`}
              </span>
            </div>
            <p className="mt-3 text-meta leading-relaxed text-muted">
              累计到期 {stats.due} 个；本轮复习 {session?.reviewWords.length ?? 0} 个、新词{" "}
              {session?.newWords.length ?? 0} 个。这里预览
              {session?.reviewWords.length ? "复习词" : "新词"}，当前展示 {visible.length}/
              {words.length} 个；其余到期词留在后续轮次，进度会自动保存。
            </p>

            <ul className="mt-1 divide-y divide-hairline">
              {visible.map((word) => {
                const level = levelLabel(word.difficulty_level);
                const ipa = ipaText(word.ipa);
                const source = vocabularySource(word, "vocabulary");
                return (
                  <li key={word.id} className="py-5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <strong className="text-title font-semibold text-ink">{word.word}</strong>
                      {ipa && <span className="font-mono text-meta text-muted">{ipa}</span>}
                      {word.part_of_speech && (
                        <span className="text-meta text-muted">
                          {partOfSpeechLabel(word.part_of_speech)}
                        </span>
                      )}
                      {level && (
                        <span className="inline-flex items-center gap-1 text-meta text-muted">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
                          {level}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`播放 ${word.word}`}
                        onClick={() => speak(word.word, { rate: 0.9 })}
                        className="rounded-sm p-1.5 text-muted transition-colors hover:text-ink"
                      >
                        <Volume2 size={15} />
                      </button>
                    </div>
                    <DictionaryMeaning
                      translation={word.translation}
                      definition={word.definition}
                      partOfSpeech={word.part_of_speech}
                    />
                    {word.context_sentence && (
                      <p className="mt-3 text-meta leading-relaxed text-muted">
                        “<HighlightedSentence sentence={word.context_sentence} word={word.word} />”
                      </p>
                    )}
                    {source && (
                      <Link
                        href={source.href}
                        className="mt-3 inline-block text-meta text-brand-700 hover:underline"
                      >
                        {source.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
            {words.length > 6 && !expanded && (
              <Button variant="outline" className="mt-4" onClick={() => setExpanded(true)}>
                预览中还有 {words.length - 6} 个词 · 展开
              </Button>
            )}
          </section>
        )}
      </div>

      <aside className="user-page-aside" aria-label="词库信息">
        {emptyState ? (
          <>
            <section className="user-aside-sec">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="user-aside-title">空词库</h2>
                <span className="text-meta text-muted tabular-nums">0 词</span>
              </div>
              <p className="text-meta leading-relaxed text-muted">
                还没有词。加入后，这里会出现到期数量、来源和下一次复习时间。
              </p>
            </section>
            <section className="user-aside-sec">
              <h2 className="user-aside-title">词库会记住什么</h2>
              <div className="user-kv">
                {[
                  ["词义与词性", "释义"],
                  ["出现的原句", "上下文"],
                  ["来源视频与句号", "出处"],
                  ["下次复习时间", "安排"],
                ].map(([label, value]) => (
                  <div key={label} className="user-kv-row">
                    <span className="user-kv-key">{label}</span>
                    <span className="user-kv-val font-normal text-muted">{value}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="user-aside-sec">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="user-aside-title">复习队列</h2>
                <span className="text-meta text-muted tabular-nums">{stats.total} 词</span>
              </div>
              <div className="user-kv">
                <div className="user-kv-row">
                  <span className="user-kv-key">累计到期</span>
                  <span className="user-kv-val text-brand-700">{loading ? "—" : stats.due}</span>
                </div>
                {nextBatch && (
                  <div className="user-kv-row">
                    <span className="user-kv-key">下一批 · {nextBatch.label}</span>
                    <span className="user-kv-val">{nextBatch.count}</span>
                  </div>
                )}
                <div className="user-kv-row">
                  <span className="user-kv-key">之后几天</span>
                  <span className="user-kv-val">{loading ? "—" : later}</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">已掌握</span>
                  <span className="user-kv-val">{loading ? "—" : stats.mastered}</span>
                </div>
              </div>
              {stats.total > 0 && (
                <div
                  className="mt-3 flex h-1 overflow-hidden rounded-pill bg-surface-soft"
                  aria-hidden
                >
                  <span
                    className="block h-full bg-brand-500"
                    style={{ width: `${(stats.due / stats.total) * 100}%` }}
                  />
                  <span
                    className="block h-full bg-hairline-strong"
                    style={{ width: `${(later / stats.total) * 100}%` }}
                  />
                  <span
                    className="block h-full bg-success"
                    style={{ width: `${(stats.mastered / stats.total) * 100}%` }}
                  />
                </div>
              )}
              <p className="mt-3 text-meta leading-relaxed text-muted">
                只处理今天出现的词，其余的不用今天完成。
              </p>
              <Link
                href="/vocabulary/sets"
                className="mt-3 inline-block text-copy font-semibold text-ink hover:text-brand-700"
              >
                按词单查看 →
              </Link>
            </section>

            {sourceRows.length > 0 && (
              <section className="user-aside-sec">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="user-aside-title">这些词从哪来</h2>
                  <span className="text-meta text-muted">{sourceRows.length} 段</span>
                </div>
                <ul>
                  {sourceRows.map((row) => (
                    <li key={row.videoId} className="border-b border-hairline-soft last:border-0">
                      <Link
                        href={watchHref(row.videoId, { from: "vocabulary" })}
                        className="flex items-baseline justify-between gap-3 py-1.5 text-meta leading-relaxed text-body hover:text-brand-700"
                      >
                        <span className="min-w-0 truncate">{row.title}</span>
                        <span className="flex-none text-muted tabular-nums">{row.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-meta leading-relaxed text-muted">
                  点击来源可回到观看页的对应视频。
                </p>
              </section>
            )}

            <section className="user-aside-sec">
              <h2 className="user-aside-title">复习记录</h2>
              <p className="text-copy text-body">
                {session
                  ? `今天已练 ${session.today.words_learned} 个词${
                      session.today.rounds > 0 ? ` · ${session.today.rounds} 轮` : ""
                    }`
                  : "—"}
              </p>
              <p className="mt-2 text-meta leading-relaxed text-muted">
                按复习间隔安排；今天只处理今天到期的词。
              </p>
            </section>

            <section className="user-aside-sec">
              <h2 className="user-aside-title">学习设置</h2>
              <label className="block text-meta text-muted">
                每天想记的新词数
                <select
                  value={session?.preferences?.daily_new_target ?? 10}
                  disabled={saving || !session}
                  onChange={(e) => void saveQuota(Number(e.target.value))}
                  className="mt-3 block w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-copy text-ink"
                >
                  {Array.from(
                    new Set([5, 10, 20, 30, 50, 100, session?.preferences?.daily_new_target ?? 10])
                  )
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n} 个新词
                      </option>
                    ))}
                </select>
              </label>
              <p className="mt-3 text-meta leading-relaxed text-muted">
                这是你的偏好，随时可以调整。
              </p>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

/** 空词库：设计 empty 态的三步收词引导（不写死演示词条，示例句用中性文案）。 */
function EmptyGuide() {
  return (
    <section aria-labelledby="vocab-empty-title" className="max-w-[52rem]">
      <div className="user-sec-head">
        <h2 id="vocab-empty-title" className="user-sec-title">
          怎么把第一个词收进来
        </h2>
        <span className="user-sec-sub">3 步</span>
      </div>
      <p className="mt-3 text-copy leading-relaxed text-muted">
        词库不要求你先定目标。看视频时遇到想记的词，点一下，它就会连同原句和来源一起留下。
      </p>
      <ol className="mt-6 grid gap-5 md:grid-cols-3">
        {[
          {
            no: "01",
            title: "在字幕里点一个词",
            body: "观看页的字幕可以逐词点读；先看它在这句话里的意思，再决定要不要收。",
          },
          {
            no: "02",
            title: "连同原句收进词库",
            body: "不是只存一个释义。原句、来源视频和句子位置会一起留下，之后还能回看。",
          },
          {
            no: "03",
            title: "到期时回来复习",
            body: "词会按复习间隔回到队列。今天没有到期词时，页面会说明下一批。",
          },
        ].map((step) => (
          <li key={step.no} className="border-t border-hairline-strong pt-3">
            <span className="text-meta font-bold tracking-[0.09em] text-muted">{step.no}</span>
            <h3 className="mt-1 text-copy font-bold text-ink">{step.title}</h3>
            <p className="mt-1 text-meta leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap items-center gap-2 text-caption text-muted">
        {["现在加入", "3 天后", "7 天后", "16 天后", "35 天后"].map((label) => (
          <span
            key={label}
            className="inline-flex h-6 items-center rounded-sm border border-hairline px-2"
          >
            {label}
          </span>
        ))}
      </div>
      <p className="mt-4 text-copy text-muted">
        <BookOpen size={15} className="mr-1 inline-block align-[-2px]" aria-hidden />
        先去频道挑一段视频，点几个词，这里就有内容了。
      </p>
    </section>
  );
}
