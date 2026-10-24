"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ListFilter, Play } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useVocabSetDetail } from "@/hooks/useVocabSetDetail";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import { Image } from "@/components/ui/Image";
import { TabPills } from "@/components/ui/TabPills";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { SetEditor } from "@/components/vocabulary/SetEditor";
import { HighlightedSentence } from "@/components/vocabulary/HighlightedSentence";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { api } from "@/lib/api";
import { levelMeta } from "@/lib/examLevels";
import { dictionaryPreview, partOfSpeechLabel } from "@/lib/vocabularyPresentation";
import { watchHref, watchSentenceHref } from "@/lib/watchEntry";
import { relativeTime } from "@/lib/utils";
import type { Paginated, VocabSetWord, VocabularyWord } from "@/types";

type SetWord = VocabSetWord;

interface VocabStats {
  total: number;
  due_count: number;
  mastered_count: number;
}

const BATCH = 12;

const SCOPE_TABS = [
  { key: "all", label: "全部" },
  { key: "unmastered", label: "未掌握" },
  { key: "mastered", label: "已掌握" },
] as const;

type ScopeKey = (typeof SCOPE_TABS)[number]["key"];

function levelLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  return levelMeta(level)?.label ?? level.toUpperCase();
}

function ipaText(ipa: string | null | undefined): string | null {
  if (!ipa) return null;
  const value = ipa.trim();
  if (!value) return null;
  if (value.startsWith("/") && value.endsWith("/")) return value;
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

function isMastered(word: SetWord): boolean {
  return word.status === "known" || word.status === "learned";
}

function typeLabel(source: string | null | undefined): string {
  if (source === "exam") return "考试";
  if (source === "custom") return "自建";
  return "视频";
}

function sourceLabel(source: string | null | undefined): string {
  if (source === "exam") return "考试词单";
  if (source === "custom") return "自建词单";
  return "来源视频";
}

/**
 * 词单详情（设计 set-detail.html）：
 * 页头（类型徽标 + 标题 + 说明 + 动作）→ 封面/进度/facts → 左：来源视频 + 5 列表格
 * （词/音标、词性、词义、级别、来源句，分批加载）；右：这个词单 / 词库口径 / 下一步。
 *
 * 级别与来源句都来自后端：`exam_level` 是收词时写下的 ECDICT 最高级，
 * `context_sentence` 在词条没存句子时用关联字幕补上，中文由 `context_sentence_zh` 给出。
 */
export default function VocabSetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { isAuthenticated, isLoading } = useRequireAuth();
  // 作用域在本地过滤（全部/未掌握/已掌握）；「已掌握」后端没有对应 scope。
  const { detail, loading, error, reload } = useVocabSetDetail(
    id,
    "all",
    isAuthenticated && !isLoading
  );
  const [scope, setScope] = useState<ScopeKey>("all");
  const [batch, setBatch] = useState(1);
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [dueWords, setDueWords] = useState<Set<string> | null>(null);

  // 右栏「词库口径」与「这个词单 · 今天到期」需要词库统计与到期词集合。
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let cancelled = false;
    void (async () => {
      try {
        const [s, dueList] = await Promise.all([
          api<VocabStats>("/api/v1/vocabulary/stats"),
          api<Paginated<VocabularyWord>>("/api/v1/vocabulary?due_only=true&page_size=100"),
        ]);
        if (cancelled) return;
        setStats(s);
        setDueWords(new Set(dueList.items.map((w) => w.word.toLowerCase())));
      } catch {
        /* 统计拿不到时右栏退化为「—」 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading]);

  const words = useMemo<SetWord[]>(() => (detail?.words ?? []) as SetWord[], [detail]);
  const masteredCount = detail?.mastered_count ?? 0;
  const total = detail?.total ?? 0;
  const pct = total > 0 ? Math.round((masteredCount / total) * 100) : 0;
  const dueInSet =
    dueWords === null ? null : words.filter((w) => dueWords.has(w.word.toLowerCase())).length;

  const filtered = useMemo(() => {
    if (scope === "unmastered") return words.filter((w) => !isMastered(w));
    if (scope === "mastered") return words.filter((w) => isMastered(w));
    return words;
  }, [words, scope]);
  const totalBatches = Math.max(1, Math.ceil(filtered.length / BATCH));
  const currentBatch = Math.min(batch, totalBatches);
  const visible = filtered.slice(0, currentBatch * BATCH);
  const rest = filtered.length - visible.length;

  if (isLoading || !isAuthenticated) return <FullPageSpinner />;

  if (error && !detail) {
    return (
      <PageTransition>
        <div className="user-page">
          <ErrorState title={error} onRetry={reload} className="py-16" />
        </div>
      </PageTransition>
    );
  }

  if (loading && !detail) {
    return (
      <PageTransition>
        <div className="user-page">
          <div className="flex justify-center py-16">
            <InlineSpinner />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!detail) return null;

  const ctaSieveLabel = masteredCount === 0 ? "快速筛词" : "继续筛词";
  const description =
    detail.source_type === "exam"
      ? "考试词单按考纲整理，词表里没有原句；筛完把不会的词学掉即闭环。"
      : detail.source_type === "custom"
        ? "自建词单，可以随时加词、删词；筛完把不会的词学掉即闭环。"
        : "词单里的词、释义与原句都来自这段视频；筛完把不会的词学掉即闭环。";

  return (
    <PageTransition>
      <div className="user-page">
        <PageHeader
          crumb={
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center rounded-sm border border-hairline px-1.5 py-0.5 text-caption font-semibold normal-case tracking-normal text-muted">
                {typeLabel(detail.source_type)}
              </span>
              <span>{sourceLabel(detail.source_type)}</span>
            </span>
          }
          title={detail.title}
          description={description}
          actions={
            <>
              <Link
                href="/vocabulary/sets"
                className="inline-flex items-center gap-1 text-copy text-muted hover:text-ink"
              >
                <ChevronLeft size={15} />
                全部词单
              </Link>
              <Link
                href={`/vocabulary/sets/${id}/sieve`}
                data-testid="start-sieve"
                className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-canvas px-3.5 py-2 text-copy font-semibold text-ink hover:border-ink"
              >
                <ListFilter size={14} />
                {ctaSieveLabel}
              </Link>
              <LinkButton href="/vocabulary/drill" size="nav" icon={Play}>
                开始训练
              </LinkButton>{" "}
            </>
          }
        />

        {/* 封面 + 进度 + facts（设计 .vt-detail-head）。
            手机上封面撑不满一行、也放不进 14rem 的正文列，只会变成左侧一张 176px
            的小图 + 下方通栏进度条；而来源视频卡里本来就有同一张 72px 封面，
            所以窄屏直接收起这块图，让进度和事实行占满宽度。 */}
        <div className="mt-5 flex flex-wrap items-start gap-5">
          <div className="relative hidden aspect-video w-44 flex-none overflow-hidden rounded-md bg-surface-card sm:block">
            {detail.thumbnail_url ? (
              <Image src={detail.thumbnail_url} alt="" sizes="176px" />
            ) : (
              <span className="grid h-full place-items-center text-meta text-body">无封面</span>
            )}
          </div>
          <div className="min-w-[14rem] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-1.5 min-w-[8rem] max-w-[24rem] flex-1 overflow-hidden rounded-pill bg-surface-card">
                <span
                  className="block h-full rounded-pill bg-brand-500"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="flex-none text-copy text-muted tabular-nums">
                已掌握 {masteredCount}/{total} · {pct}%
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted">
              <span>共 {total} 词</span>
              <span>{dueInSet === null ? "今天到期 —" : `今天到期 ${dueInSet} 词`}</span>
              <span>
                更新于{" "}
                {detail.last_activity_at ? relativeTime(detail.last_activity_at) : "尚未更新"}
              </span>
            </div>
          </div>
        </div>

        <div className="user-page-layout has-aside">
          <div className="user-page-main">
            {/* 来源视频 */}
            <section aria-labelledby="set-source-title">
              <div className="user-sec-head">
                <h2 id="set-source-title" className="user-sec-title">
                  来源视频
                </h2>
              </div>
              {detail.video_id ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-hairline bg-surface-soft p-3">
                  <div className="relative aspect-video w-[4.5rem] flex-none overflow-hidden rounded-sm bg-surface-card">
                    {detail.thumbnail_url ? (
                      <Image src={detail.thumbnail_url} alt="" sizes="72px" />
                    ) : (
                      <span className="grid h-full place-items-center text-caption text-body">
                        无封面
                      </span>
                    )}
                  </div>
                  {/* 手机上「缩略图 + 标题 + 按钮」挤不下：标题只留两行，
                      按钮换到下一行并占满宽度，而不是把标题压成五行窄条。 */}
                  <div className="min-w-0 flex-1 basis-[10rem]">
                    <p className="line-clamp-2 text-copy font-semibold text-ink">{detail.title}</p>
                    <p className="mt-0.5 text-meta text-muted">
                      {sourceLabel(detail.source_type)}
                      {detail.exam_level ? ` · ${detail.exam_level.toUpperCase()}` : ""}
                    </p>
                  </div>
                  <Link
                    href={watchHref(detail.video_id, { from: "set", extra: { set: id } })}
                    className="inline-flex w-full flex-none items-center justify-center gap-1.5 rounded-sm border border-hairline bg-canvas px-3 py-1.5 text-meta font-semibold text-ink hover:border-ink sm:w-auto"
                  >
                    <Play size={13} />
                    回看原视频
                  </Link>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-surface-soft p-3">
                  <div>
                    <p className="text-copy font-semibold text-ink">这个词单没有绑定视频</p>
                    <p className="mt-0.5 text-meta text-muted">
                      {detail.source_type === "exam"
                        ? "考试词单按考纲整理，词表里没有原句。"
                        : "自建词单，词和释义由你补充。"}
                    </p>
                  </div>
                  <Link
                    href="/vocabulary?tab=library&sub=words"
                    className="inline-flex flex-none items-center rounded-sm border border-hairline bg-canvas px-3 py-1.5 text-meta font-semibold text-ink hover:border-ink"
                  >
                    去词库看全部词
                  </Link>
                </div>
              )}
            </section>

            {/* 词表 */}
            <section aria-labelledby="set-words-title">
              <div className="user-sec-head">
                <h2 id="set-words-title" className="user-sec-title">
                  词表
                </h2>
                <span className="user-sec-sub tabular-nums">
                  已显示 {visible.length} / {filtered.length} 行
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <TabPills
                  variant="chips"
                  tabs={SCOPE_TABS.map((t) => ({ key: t.key, label: t.label }))}
                  activeKey={scope}
                  onChange={(key) => {
                    setScope(key as ScopeKey);
                    setBatch(1);
                  }}
                />
                <span className="text-meta text-muted">点词可回观看页核对原句</span>
              </div>

              <div className="mt-4 overflow-x-auto overscroll-x-contain rounded-lg border border-hairline">
                <table className="w-full min-w-[46rem] table-fixed border-collapse text-copy">
                  {/* 固定列宽：默认布局会把宽度全给「词 / 音标」，把「级别」挤成
                      竖排两个字、「来源句」挤成窄条。 */}
                  <colgroup>
                    <col className="w-[20%]" />
                    <col className="w-[11%]" />
                    <col className="w-[24%]" />
                    <col className="w-[9%]" />
                    <col className="w-[36%]" />
                  </colgroup>
                  <caption className="border-b border-hairline-soft px-4 py-3 text-left text-meta text-muted">
                    词、音标、词性、词义、级别与来源句。
                  </caption>
                  <thead>
                    <tr className="bg-surface-soft">
                      {["词 / 音标", "词性", "词义", "级别", "来源句"].map((label) => (
                        <th
                          key={label}
                          scope="col"
                          className="border-b border-hairline px-4 py-3 text-left text-meta font-bold text-muted"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-meta text-muted">
                          {words.length > 0
                            ? "这个筛选下没有词。切回「全部」看看。"
                            : "这个词单还没有词。去视频里收几个词，或先练今天到期的词。"}
                        </td>
                      </tr>
                    ) : (
                      visible.map((word) => {
                        // 词的级别优先用它自己的 ECDICT 级别；缺失时退回词单的级别
                        // （视频词单里的词确实都属于这个筛选级别）。
                        const level = levelLabel(word.exam_level ?? detail.exam_level);
                        const ipa = ipaText(word.ipa);
                        const meaning = dictionaryPreview(
                          word.translation,
                          word.definition,
                          word.part_of_speech
                        );
                        const sentenceHref =
                          detail.video_id && word.subtitle_id
                            ? watchSentenceHref(
                                detail.video_id,
                                { from: "set", extra: { set: id } },
                                {
                                  subtitleId: word.subtitle_id,
                                  startTime: word.start_time,
                                  word: word.word,
                                }
                              )
                            : null;
                        return (
                          <tr
                            key={word.set_word_id}
                            className="border-b border-hairline-soft align-top last:border-0"
                          >
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <Link
                                  href={
                                    sentenceHref ??
                                    (detail.video_id
                                      ? watchHref(detail.video_id, {
                                          from: "set",
                                          extra: { set: id },
                                        })
                                      : "/vocabulary?tab=library&sub=words")
                                  }
                                  className="font-semibold text-ink underline decoration-dotted underline-offset-2 hover:text-brand-700"
                                >
                                  {word.word}
                                </Link>
                                {ipa && (
                                  <span className="font-mono text-meta text-muted">{ipa}</span>
                                )}
                              </div>
                              {isMastered(word) && (
                                <span className="mt-1 inline-flex items-center rounded-sm bg-success-soft px-1.5 py-0.5 text-caption font-semibold text-success-text">
                                  已掌握
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-meta italic text-muted">
                              {partOfSpeechLabel(word.part_of_speech) || "—"}
                            </td>
                            <td className="px-4 py-3 text-body">
                              {meaning.summary}
                              {meaning.expandable && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-caption text-muted hover:text-ink">
                                    完整释义
                                  </summary>
                                  <p className="mt-1 whitespace-pre-line text-meta leading-relaxed text-muted">
                                    {meaning.full}
                                  </p>
                                </details>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {level ? (
                                <span className="inline-flex items-center gap-1 text-meta text-muted">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full bg-brand-500"
                                    aria-hidden
                                  />
                                  {level}
                                </span>
                              ) : (
                                <span className="text-meta text-muted">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {word.context_sentence ? (
                                <>
                                  <span className="block text-meta leading-relaxed text-muted">
                                    “
                                    <HighlightedSentence
                                      sentence={word.context_sentence}
                                      word={word.word}
                                    />
                                    ”
                                  </span>
                                  {word.context_sentence_zh && (
                                    <span className="mt-0.5 block text-caption leading-relaxed text-muted">
                                      {word.context_sentence_zh}
                                    </span>
                                  )}
                                  {sentenceHref && (
                                    <Link
                                      href={sentenceHref}
                                      className="mt-1 inline-block text-caption text-brand-700 hover:underline"
                                    >
                                      回到原句 ↗
                                    </Link>
                                  )}
                                </>
                              ) : (
                                <span className="text-meta text-muted">
                                  {detail.source_type === "exam" || detail.source_type === "custom"
                                    ? "考试词单与自建词单不绑定原句。"
                                    : "这段视频里没有取到这个词所在的句子。"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-meta text-muted">窄屏下这张表可以左右滑动查看全部列。</p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-meta text-muted tabular-nums">
                  这个词单 {filtered.length} 个词条按 {BATCH} 行一批加载，当前第 {currentBatch} /{" "}
                  {totalBatches} 批
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {Array.from({ length: totalBatches }).map((_, i) => {
                    const n = i + 1;
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-current={n === currentBatch ? "true" : undefined}
                        onClick={() => setBatch(n)}
                        className={
                          n === currentBatch
                            ? "inline-flex h-7 min-w-7 items-center justify-center rounded-sm border border-ink bg-ink px-1.5 text-meta text-canvas"
                            : "inline-flex h-7 min-w-7 items-center justify-center rounded-sm border border-hairline-strong bg-canvas px-1.5 text-meta text-body hover:border-muted hover:text-ink"
                        }
                      >
                        {n}
                      </button>
                    );
                  })}
                  {rest > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setBatch(currentBatch + 1)}>
                      再加载 {Math.min(BATCH, rest)} 行（还剩 {rest} 行）
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Link
                  href={`/vocabulary/sets/${id}/sieve`}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-canvas px-3.5 py-2 text-copy font-semibold text-ink hover:border-ink"
                >
                  <ListFilter size={14} />
                  {ctaSieveLabel}
                </Link>
              </div>
            </section>
          </div>

          <aside className="user-page-aside" aria-label="词单信息">
            <section className="user-aside-sec">
              <h2 className="user-aside-title">这个词单</h2>
              <div className="user-kv">
                <div className="user-kv-row">
                  <span className="user-kv-key">词数</span>
                  <span className="user-kv-val">{total} 词</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">已掌握</span>
                  <span className="user-kv-val">{masteredCount} 词</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">今天到期</span>
                  <span className="user-kv-val">
                    {dueInSet === null ? "—" : dueInSet > 0 ? `${dueInSet} 词` : "没有"}
                  </span>
                </div>
              </div>
            </section>

            <section className="user-aside-sec">
              <h2 className="user-aside-title">词汇概览</h2>
              {stats ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-meta">
                    {[
                      ["词库", `${stats.total} 词`],
                      ["今天到期", `${stats.due_count}`],
                      [
                        "之后",
                        `${Math.max(0, stats.total - stats.due_count - stats.mastered_count)}`,
                      ],
                      ["已掌握", `${stats.mastered_count}`],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div className="text-title font-bold text-ink tabular-nums">{value}</div>
                        <div className="mt-0.5 text-meta text-muted">{label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-meta leading-relaxed text-muted">
                    词单里的词可以同时出现在多个词单里，所以各词单词数相加不等于词库总数。
                  </p>
                </>
              ) : (
                <p className="text-meta text-muted">正在读取词库统计…</p>
              )}
            </section>

            <section className="user-aside-sec">
              <h2 className="user-aside-title">下一步</h2>

              <Link
                href="/vocabulary/drill"
                className="mt-3 inline-block text-copy font-semibold text-ink hover:text-brand-700"
              >
                今天到期的词 →
              </Link>
            </section>
          </aside>
        </div>

        <SetEditor detail={detail} onChange={reload} />
      </div>
    </PageTransition>
  );
}
