"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { BookOpen, Compass, Layers, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { watchHref } from "@/lib/watchEntry";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { VideoCard } from "@/components/ui/VideoCard";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { useVideoMetadata } from "@/hooks/useVideoMetadata";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { scrollKey } from "@/lib/scrollMemory";
import { toastApiError } from "@/lib/errors";
import type { VideoCard as Video } from "@/types";

interface Word {
  lemma: string;
  phonetic: string | null;
  translation: string | null;
  definition: string | null;
  /** 词性，后端形如 "n:100"。 */
  pos?: string | null;
  levels: string[];
}
interface SubtitleResult {
  id: string;
  text_en: string;
  text_zh: string | null;
  start_time: number;
  video: Video;
}
interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}
interface Group<T> {
  items: T[];
  has_more: boolean;
}
interface Results {
  videos?: Group<Video>;
  subtitles?: Group<SubtitleResult>;
  words?: Group<Word>;
  channels?: Group<Channel>;
}
const GROUPS = { all: "全部", videos: "视频", subtitles: "字幕", words: "词汇", channels: "频道" };
const GROUP_UNITS: Record<string, string> = {
  videos: "条",
  subtitles: "句",
  words: "个",
  channels: "个",
};
/** 词库档位 id → 设计稿 tag 的中文口径。 */
const WORD_LEVEL_LABELS: Record<string, string> = {
  zhongkao: "中考",
  gaoKao: "高考",
  cet4: "四级",
  cet6: "六级",
  ky: "考研",
  ielts: "雅思",
};
const HISTORY_KEY = "seeword_search_history";

function stamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** 命中标出：英文原文与中文译文都走这里（设计对两种语言都标，并注明命中在哪种）。 */
function Highlight({ text, query }: { text: string; query: string }) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  return index < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-brand-50 px-0.5 font-semibold text-brand-700">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

export default function SearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = params.get("q")?.trim() || "";
  const rawGroup = params.get("group") || "all";
  const group = Object.hasOwn(GROUPS, rawGroup) ? (rawGroup as keyof typeof GROUPS) : "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [input, setInput] = useState(query);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [hot, setHot] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(value))
        setHistory(value.filter((x): x is string => typeof x === "string").slice(0, 10));
    } catch {
      /* storage unavailable */
    }
    api<{ hot: string[] }>("/api/v1/videos/search/hot")
      .then((v) => setHot(v.hot))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setInput(query);
  }, [query]);

  useEffect(() => {
    if (!input.trim() || input === query) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<{ suggestions: string[] }>(
        `/api/v1/videos/search/suggest?q=${encodeURIComponent(input)}&limit=5`,
        { signal: controller.signal }
      )
        .then((v) => setSuggestions(v.suggestions))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, query]);

  useEffect(() => {
    setResults(null);
    setError(null);
    if (!query) return;
    const controller = new AbortController();
    api<Results>(
      `/api/v1/discovery/search?q=${encodeURIComponent(query)}&group=${group}&page=${page}`,
      { signal: controller.signal }
    )
      .then(setResults)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "搜索失败");
      });
    return () => controller.abort();
  }, [query, group, page, retry]);

  const metadata = useVideoMetadata(results?.videos?.items ?? []);
  useScrollRestore(scrollKey(pathname, params.toString()), results !== null);

  const counts = {
    videos: results?.videos?.items.length ?? 0,
    subtitles: results?.subtitles?.items.length ?? 0,
    words: results?.words?.items.length ?? 0,
    channels: results?.channels?.items.length ?? 0,
  };
  const totalHits = counts.videos + counts.subtitles + counts.words + counts.channels;
  const allEmpty = results !== null && totalHits === 0;

  function url(nextGroup: string, nextPage = 1, term = query) {
    return `/search?${new URLSearchParams({ q: term, group: nextGroup, ...(nextPage > 1 ? { page: String(nextPage) } : {}) })}`;
  }

  function submit(term: string) {
    term = term.trim();
    if (!term) return;
    const next = [term, ...history.filter((h) => h !== term)].slice(0, 10);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    setSuggestions([]);
    router.push(url("all", 1, term));
  }

  function hitChip(label: string, count: number, hasMore = false) {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-surface-card px-2 text-caption font-bold tabular-nums text-body">
        {label} {count}
        {hasMore ? "+" : ""}
      </span>
    );
  }

  function groupSection(
    key: Exclude<keyof Results, never>,
    title: string,
    why: ReactNode,
    children: ReactNode
  ) {
    const data = results?.[key];
    if (!data) return null;
    const unit = GROUP_UNITS[key] ?? "个";
    return (
      <section className="flex flex-col gap-4" aria-label={title}>
        <div className="user-sec-head">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="user-sec-title">{title}</h2>
            <span className="inline-flex h-6 items-center rounded-pill bg-surface-card px-2 text-caption font-bold tabular-nums text-body">
              {data.items.length}
              {data.has_more ? "+" : ""} {unit}
            </span>
          </div>
          {group === "all" && data.has_more && (
            <Link href={url(key)} className="text-meta text-muted hover:text-ink">
              查看全部 →
            </Link>
          )}
        </div>
        {data.items.length ? (
          <>
            <p className="max-w-[62ch] text-meta leading-relaxed text-body">{why}</p>
            {children}
          </>
        ) : (
          <p className="text-copy text-muted">没有匹配的{title}，试试缩短关键词。</p>
        )}
      </section>
    );
  }

  return (
    <PageTransition>
      <main className="pt-6 pb-18">
        <PageHeader
          crumb="搜索"
          title="搜索视频、字幕和词汇"
          description="一个词可以搜三件事：哪些视频的标题里有它、它出现在哪句字幕里、词库里有没有收过。回车会把关键词写进地址栏，链接可以直接分享。"
          actions={
            <LinkButton variant="outline" icon={Compass} href="/">
              不想搜，按分类挑
            </LinkButton>
          }
        />

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
          className="relative mt-5 max-w-2xl"
          role="search"
        >
          <label htmlFor="discovery-search" className="sr-only">
            搜索关键词
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                id="discovery-search"
                type="search"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="h-11 w-full min-w-0 rounded-md border border-hairline-strong bg-surface-soft pl-9 pr-10 text-copy text-ink placeholder:text-muted focus:border-ink focus:bg-canvas focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                placeholder="搜视频、原句、词汇、频道"
              />
              {input && (
                <button
                  type="button"
                  aria-label="清空搜索"
                  onClick={() => {
                    setInput("");
                    submit("");
                  }}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-pill text-muted hover:bg-surface-card hover:text-ink"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <Button type="submit" variant="dark">
              <Search size={16} />
              搜索
            </Button>
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute z-20 w-full rounded-md border border-hairline bg-canvas">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => submit(s)}
                    className="w-full px-4 py-3 text-left text-copy hover:bg-surface-soft"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="user-page-layout has-aside">
          <div className="user-page-main">
            {!query ? (
              <div className="flex max-w-2xl flex-col gap-8">
                {history.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <div className="user-sec-head">
                      <h2 className="user-sec-title">最近搜过</h2>
                      <button
                        type="button"
                        className="text-meta text-muted hover:text-ink"
                        onClick={() => {
                          setHistory([]);
                          try {
                            localStorage.removeItem(HISTORY_KEY);
                          } catch {
                            /* storage unavailable */
                          }
                        }}
                      >
                        清空记录
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {history.map((h) => (
                        <Button key={h} variant="outline" size="sm" onClick={() => submit(h)}>
                          {h}
                        </Button>
                      ))}
                    </div>
                  </section>
                )}
                <section className="flex flex-col gap-3">
                  <div className="user-sec-head">
                    <h2 className="user-sec-title">热门搜索</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hot.map((h) => (
                      <Button key={h} variant="outline" size="sm" onClick={() => submit(h)}>
                        {h}
                      </Button>
                    ))}
                  </div>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1 text-copy text-body hover:text-ink"
                  >
                    也可以按频道挑一段 →
                  </Link>
                </section>
              </div>
            ) : (
              <>
                <nav className="flex flex-wrap gap-2" aria-label="搜索类型">
                  {Object.entries(GROUPS).map(([key, label]) => (
                    <Link
                      key={key}
                      href={url(key)}
                      aria-current={group === key ? "page" : undefined}
                      className={`inline-flex h-8 items-center rounded-pill px-3 text-meta font-medium ${
                        group === key
                          ? "bg-ink text-canvas"
                          : "border border-hairline-strong bg-canvas text-body hover:border-muted-soft hover:text-ink"
                      }`}
                    >
                      {label}
                    </Link>
                  ))}
                </nav>

                {error ? (
                  <ErrorState title={error} onRetry={() => setRetry((v) => v + 1)} />
                ) : !results ? (
                  <p role="status" className="py-10 text-copy text-muted">
                    正在搜索…
                  </p>
                ) : (
                  <>
                    {/* 命中总览：四组计数（0 也显示），设计 .d-res-sum */}
                    <div className="flex flex-col gap-3">
                      <div className="user-sec-head">
                        <h2 className="user-sec-title">命中总览</h2>
                        <span className="user-sec-sub">「{query}」的搜索结果</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                        {hitChip("视频", counts.videos, results.videos?.has_more)}
                        {hitChip("字幕", counts.subtitles, results.subtitles?.has_more)}
                        {hitChip("词汇", counts.words, results.words?.has_more)}
                        {hitChip("频道", counts.channels, results.channels?.has_more)}
                      </div>
                    </div>

                    {/* 全空：设计只给空态（4 组 0 计数已在上面），不再堆 4 组空说明 */}
                    {allEmpty && (
                      <EmptyState
                        icon={BookOpen}
                        title={`没有找到“${query}”`}
                        description="换一个词，或去浏览页按分类挑一段。链接可以直接分享给同学。"
                        action={
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <LinkButton variant="outline" size="sm" href="/">
                              去浏览视频
                            </LinkButton>
                            <LinkButton variant="text" size="sm" href="/channels">
                              按频道找
                            </LinkButton>
                          </div>
                        }
                      />
                    )}

                    {!allEmpty && (
                      <>
                        {groupSection(
                          "videos",
                          "视频",
                          <>
                            为什么命中：关键词出现在视频标题或中文名里（
                            {counts.videos}
                            条），点封面直接进观看页。
                          </>,
                          <div className="user-content-list">
                            {results.videos?.items.map((v) => (
                              <VideoCard
                                key={v.id}
                                video={{ ...v, ...metadata[v.id] }}
                                entry={{ from: "search", extra: { q: query, group, page } }}
                              />
                            ))}
                          </div>
                        )}

                        {groupSection(
                          "subtitles",
                          "字幕",
                          <>
                            为什么命中：下面每一句的英文或中文译文里有「
                            {query}
                            」，命中位置已标出；点时间回观看页从那一句开始。
                          </>,
                          <ul className="flex flex-col">
                            {results.subtitles?.items.map((s) => {
                              const hitInEn = s.text_en.toLowerCase().includes(query.toLowerCase());
                              return (
                                <li
                                  key={s.id}
                                  className="border-t border-hairline-soft first:border-t-0"
                                >
                                  <Link
                                    href={watchHref(s.video.id, {
                                      from: "search",
                                      extra: { q: query, group, page, t: s.start_time },
                                    })}
                                    className="grid gap-2 py-4 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-4"
                                  >
                                    <span className="text-meta tabular-nums text-muted">
                                      <span className="block">{stamp(s.start_time)}</span>
                                      <span className="mt-0.5 block truncate">{s.video.title}</span>
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block text-copy-lg leading-relaxed text-ink">
                                        <Highlight text={s.text_en} query={query} />
                                      </span>
                                      {s.text_zh && (
                                        <span className="mt-1 block text-meta leading-relaxed text-muted">
                                          <Highlight text={s.text_zh} query={query} />
                                        </span>
                                      )}
                                      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
                                        <span>
                                          命中在哪：
                                          {hitInEn ? "英文原句" : "中文译文"} · 来自《
                                          {s.video.title}》
                                        </span>
                                        <span className="font-semibold text-body">
                                          {stamp(s.start_time)} 从这里看 →
                                        </span>
                                      </span>
                                    </span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {groupSection(
                          "words",
                          "词汇",
                          <>
                            为什么命中：单词本身或中文释义里有「
                            {query}
                            」，可以直接收进词库。
                          </>,
                          <ul className="flex flex-col">
                            {results.words?.items.map((w) => (
                              <WordResult key={w.lemma} word={w} />
                            ))}
                          </ul>
                        )}

                        {groupSection(
                          "channels",
                          "频道",
                          <>为什么命中：频道名或说明里有「{query}」，点名字进频道页。</>,
                          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {results.channels?.items.map((c) => (
                              <li key={c.id}>
                                <Link
                                  href={`/channels/${c.slug}`}
                                  className="flex h-full flex-col gap-1 rounded-lg border border-hairline bg-canvas p-4 hover:border-hairline-strong"
                                >
                                  <span className="inline-flex items-center gap-1 text-copy font-semibold text-ink">
                                    <Layers size={14} className="text-muted" aria-hidden />
                                    {c.name}
                                  </span>
                                  {c.description && (
                                    <span className="text-meta leading-relaxed text-muted">
                                      {c.description}
                                    </span>
                                  )}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}

                    {group !== "all" && (
                      <div className="flex gap-4 py-2">
                        {page > 1 && (
                          <Link href={url(group, page - 1)} className="text-copy text-body">
                            ← 上一页
                          </Link>
                        )}
                        {results[group]?.has_more && (
                          <Link href={url(group, page + 1)} className="text-copy text-body">
                            下一页 →
                          </Link>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <aside className="user-page-aside" aria-label="搜索说明">
            <section className="user-aside-sec">
              <h2 className="user-aside-title">搜索范围</h2>
              {results ? (
                <div className="user-kv">
                  <div className="user-kv-row">
                    <span className="user-kv-key">视频标题 / 中文名</span>
                    <span className="user-kv-val tabular-nums">{counts.videos} 条</span>
                  </div>
                  <div className="user-kv-row">
                    <span className="user-kv-key">字幕（英 + 中）</span>
                    <span className="user-kv-val tabular-nums">{counts.subtitles} 句</span>
                  </div>
                  <div className="user-kv-row">
                    <span className="user-kv-key">词库释义</span>
                    <span className="user-kv-val tabular-nums">{counts.words} 词</span>
                  </div>
                  <div className="user-kv-row">
                    <span className="user-kv-key">频道名</span>
                    <span className="user-kv-val tabular-nums">{counts.channels} 个</span>
                  </div>
                </div>
              ) : (
                <p className="text-meta leading-relaxed text-body">
                  三个检索范围同时生效：视频标题与中文名、字幕整句、词库释义。
                </p>
              )}
              <p className="mt-3 text-meta leading-relaxed text-body">
                标题与词汇按整词匹配；字幕按句匹配，命中位置会标出来。中文关键词只匹配中文译文。
              </p>
            </section>

            {history.length > 0 && (
              <section className="user-aside-sec">
                <h2 className="user-aside-title">最近搜过</h2>
                <div className="flex flex-wrap gap-2">
                  {history.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => submit(h)}
                      className="inline-flex h-8 items-center rounded-pill border border-hairline-strong bg-canvas px-3 text-meta text-body hover:border-muted-soft hover:text-ink"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="user-aside-sec">
              <h2 className="user-aside-title">搜不到时怎么办</h2>
              <div className="flex flex-col gap-2">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-meta text-body hover:text-ink"
                >
                  <Compass size={15} className="text-muted" aria-hidden />
                  按分类浏览
                </Link>
                <Link
                  href="/channels"
                  className="inline-flex items-center gap-2 text-meta text-body hover:text-ink"
                >
                  <Layers size={15} className="text-muted" aria-hidden />
                  按频道找
                </Link>
                <Link
                  href="/vocabulary"
                  className="inline-flex items-center gap-2 text-meta text-body hover:text-ink"
                >
                  <BookOpen size={15} className="text-muted" aria-hidden />
                  看词库里的词
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </PageTransition>
  );
}

function WordResult({ word }: { word: Word }) {
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const pos = word.pos?.split(":")[0] || null;
  const level = word.levels?.map((item) => WORD_LEVEL_LABELS[item]).find(Boolean) ?? null;

  async function add() {
    setBusy(true);
    try {
      await api("/api/v1/vocabulary", {
        method: "POST",
        body: JSON.stringify({
          word: word.lemma,
          definition: word.definition,
          translation: word.translation,
        }),
      });
      setAdded(true);
    } catch (err) {
      toastApiError(err, "加入失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 border-t border-hairline-soft py-4 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-copy-lg font-bold text-ink">{word.lemma}</span>
          <span className="text-meta text-muted">/{word.phonetic || "音标待补充"}/</span>
          {pos && (
            <span className="rounded-sm border border-hairline px-1 text-caption text-muted">
              {pos}
            </span>
          )}
          {level && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-hairline bg-canvas px-1 text-caption font-semibold text-body">
              <span className="h-1.5 w-1.5 rounded-pill bg-brand-500" aria-hidden />
              {level}
            </span>
          )}
        </div>
        <p className="mt-1 text-copy leading-relaxed text-body">
          {word.translation || word.definition || "释义待补充"}
        </p>
        <p className="mt-2 text-caption text-muted">命中在哪：词库释义</p>
      </div>
      <Button variant="outline" size="sm" onClick={add} disabled={busy || added}>
        {added ? "已加入" : "加入生词本"}
      </Button>
    </li>
  );
}
