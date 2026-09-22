"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useDailySession } from "@/hooks/useDailySession";
import {
  BookOpen,
  Trash2,
  Volume2,
  Target,
  CheckCircle2,
  Flame,
  Search,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import { TabPills } from "@/components/ui/TabPills";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MetricCard } from "@/components/ui/MetricCard";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Image } from "@/components/ui/Image";
import { PageTransition } from "@/components/common/PageTransition";
import { DailyHero } from "@/components/vocabulary/DailyHero";
import { useSpeech } from "@/hooks/useSpeech";
import { useVocabSets } from "@/hooks/useVocabSets";
import { relativeTime } from "@/lib/utils";
import type { Paginated, VocabularyWord, VocabSet } from "@/types";

interface VocabStatsResponse {
  total: number;
  new_count: number;
  learning_count: number;
  reviewing_count: number;
  mastered_count: number;
  due_count: number;
}

const PAGE_SIZE = 24;

function masteryBadge(level: string | null | undefined): {
  tone: BadgeTone;
  text: string;
} {
  if (level === "mastered") return { tone: "green", text: "已掌握" };
  if (level === "learning") return { tone: "amber", text: "学习中" };
  return { tone: "brand", text: "待复习" };
}

/** 视频集合 tab：缩略图 + 标题 + 进度环 + 最近学习，点击进集合详情。 */
function VocabSetsPanel({
  loading,
  error,
  sets,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  sets: VocabSet[];
  onRetry: () => void;
}) {
  if (error) {
    return <ErrorState title={error} onRetry={onRetry} className="py-8" />;
  }
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-hairline bg-canvas p-4 flex items-center gap-3.5"
          >
            <div className="w-24 aspect-video rounded-md skeleton-shimmer bg-surface-soft flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 skeleton-shimmer rounded-sm bg-surface-soft" />
              <div className="h-3 w-1/3 skeleton-shimmer rounded-sm bg-surface-soft" />
            </div>
            <div className="w-11 h-11 rounded-full skeleton-shimmer bg-surface-soft flex-shrink-0" />
          </div>
        ))}
      </div>
    );
  }
  if (sets.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="还没有视频词汇集合"
        description="在视频页点「加入学习」，即可按视频把生词加进来过筛"
        action={
          <Link
            href="/browse"
            className="inline-block mt-3 text-sm font-semibold text-brand-500 hover:underline"
          >
            去频道看看 →
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      {sets.map((s) => {
        const done = s.total > 0 && s.mastered_count >= s.total;
        return (
          <Link key={s.id} href={`/vocabulary/sets/${s.id}`} className="block">
            <Card
              variant="outline"
              padding={4}
              data-testid="vocab-set-card"
              className="flex items-center gap-3.5 h-full"
            >
              <div className="relative w-24 aspect-video rounded-md overflow-hidden bg-surface-card flex-shrink-0">
                <Image src={s.thumbnail_url} alt={s.title} sizes="96px" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-ink line-clamp-1">{s.title}</p>
                <p className="text-xs text-muted mt-1">
                  {done
                    ? "已学完"
                    : s.last_activity_at
                      ? `最近学习 ${relativeTime(s.last_activity_at)}`
                      : "尚未开始"}
                </p>
              </div>
              <ProgressRing
                size={44}
                strokeWidth={4}
                progress={s.total > 0 ? s.mastered_count / s.total : 0}
                isMet={done}
                label={`${s.mastered_count}/${s.total}`}
              />
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

export default function VocabularyPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  // 顶部视图：今日（默认，百词斩式训练入口）| 词库（集合 + 单词管理）。
  // MobileTabBar 对 /vocabulary 前缀高亮，集合相关页面全部挂在 /vocabulary/sets 之下。
  const [topTab, setTopTab] = useState<"today" | "library">("today");
  // 词库内二级视图：视频集合 | 全部单词
  const [libraryTab, setLibraryTab] = useState<"sets" | "words">("sets");
  const setsView = useVocabSets(isAuthenticated && !isLoading);
  const daily = useDailySession(isAuthenticated && !isLoading);
  const [stats, setStats] = useState({
    total: 0,
    due: 0,
    mastered: 0,
    learning: 0,
  });
  const [dueOnly, setDueOnly] = useState(false);
  const [masteryFilter, setMasteryFilter] = useState<string>("all");
  const undoneRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  // 搜索防抖：避免每次击键都请求后端。
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { speak } = useSpeech();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 服务端筛选 + 分页：掌握度/待复习/搜索全部下推到后端，
  // 分页器 total 与筛选口径一致（此前 page_size=100 硬编码，
  // 超过 100 词的用户看不到剩余词）。
  // 本区只承担浏览/管理；训练入口收敛为「今日」视图的 Hero CTA → /vocabulary/drill。
  const list = usePaginatedList<VocabularyWord>({
    fetcher: (page) => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (dueOnly) params.set("due_only", "true");
      if (masteryFilter !== "all") {
        // 三元掌握度决策：无「复习中」态，learning 与 reviewing 并入「学习中」。
        params.set("mastery", masteryFilter === "learning" ? "learning,reviewing" : masteryFilter);
      }
      if (debouncedQuery) params.set("q", debouncedQuery);
      return api<Paginated<VocabularyWord>>(`/api/v1/vocabulary?${params.toString()}`);
    },
    filters: [dueOnly, masteryFilter, debouncedQuery],
    enabled: isAuthenticated && !isLoading,
  });

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    loadStats();
  }, [isLoading, isAuthenticated]);

  async function loadStats() {
    try {
      const data = await api<VocabStatsResponse>(`/api/v1/vocabulary/stats`);
      setStats({
        total: data.total,
        due: data.due_count,
        mastered: data.mastered_count,
        learning: data.learning_count + data.reviewing_count,
      });
    } catch {
      // keep existing stats on error
    }
  }

  async function handleDelete(wordId: string) {
    try {
      await api(`/api/v1/vocabulary/${wordId}`, { method: "DELETE" });
      loadStats();
    } catch {
      toast.error("移除失败");
    }
  }

  /** Optimistic delete with undo toast (Material Design: prefer undo over confirm). */
  function handleDeleteWithUndo(word: VocabularyWord) {
    // Remove from UI immediately
    undoneRef.current = false;
    list.setItems((prev) => prev.filter((w) => w.id !== word.id));
    setStats((prev) => ({ ...prev, total: prev.total - 1 }));

    // Show undo toast
    toast(`已移除「${word.word}」`, {
      duration: 5000,
      action: {
        label: "撤销",
        onClick: () => {
          // Undo: re-add the word to local state
          undoneRef.current = true;
          list.setItems((prev) => [word, ...prev]);
          setStats((prev) => ({ ...prev, total: prev.total + 1 }));
        },
      },
      onDismiss: () => {
        // Only commit delete if undo was NOT clicked
        if (!undoneRef.current) {
          handleDelete(word.id);
        }
      },
    });
  }

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const showEmpty = !list.loading && !list.error && list.items.length === 0;

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-12">
        {/* Page head: title + desc + 视图切换（今日 | 词库） */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-ink">单词训练</h1>
            <p className="text-[13px] text-muted mt-1">每天一小步，把视频里遇到的单词变成自己的</p>
          </div>
          <TabPills
            tabs={[
              { key: "today", label: "今日" },
              { key: "library", label: "词库" },
            ]}
            activeKey={topTab}
            onChange={setTopTab}
            variant="ghost"
            activeStyle="dark"
            size="sm"
          />
        </div>

        {topTab === "today" ? (
          <>
            {/* 训练 Hero：词库掌握环 + 今日队列计数 + 开始今日训练 CTA */}
            <DailyHero
              newTotal={daily.session?.totals.new_total ?? 0}
              dueTotal={daily.session?.totals.due_total ?? 0}
              total={stats.total}
              mastered={stats.mastered}
              loading={daily.loading}
            />

            {/* Stat cards (due 卡高亮) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
              <MetricCard icon={BookOpen} label="总计" value={stats.total} variant="label-top" />
              <MetricCard
                icon={Target}
                label="待复习"
                value={stats.due}
                tone="brand"
                variant="label-top"
                className="ring-2 ring-brand-500/30 ring-offset-2 ring-offset-canvas"
              />
              <MetricCard
                icon={CheckCircle2}
                label="已掌握"
                value={stats.mastered}
                tone="success"
                variant="label-top"
              />
              <MetricCard
                icon={Flame}
                label="学习中"
                value={stats.learning}
                tone="warning"
                variant="label-top"
              />
            </div>

            {/* 全新用户空态：一个词都没有时引导去频道看视频收集生词 */}
            {!daily.loading && stats.total === 0 && !daily.error && (
              <EmptyState
                icon={BookOpen}
                title="还没有生词"
                description="去频道看视频，点击字幕里的单词就能加入词库"
                action={
                  <Link
                    href="/browse"
                    className="inline-block mt-3 text-sm font-semibold text-brand-500 hover:underline"
                  >
                    去频道看看 →
                  </Link>
                }
              />
            )}
          </>
        ) : (
          <>
            {/* 词库二级切换：视频集合 | 全部单词 */}
            <div className="flex justify-end mb-5">
              <TabPills
                tabs={[
                  { key: "sets", label: "视频集合" },
                  { key: "words", label: "全部单词" },
                ]}
                activeKey={libraryTab}
                onChange={setLibraryTab}
                variant="ghost"
                activeStyle="dark"
                size="sm"
              />
            </div>

            {libraryTab === "sets" ? (
              <VocabSetsPanel
                loading={setsView.loading}
                error={setsView.error}
                sets={setsView.sets}
                onRetry={setsView.refresh}
              />
            ) : (
              <>
                {/* Filter bar: 掌握度筛选 + 全部/待复习 + 搜索（均为服务端筛选） */}
                <div className="filter-bar mb-5">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex gap-1.5 overflow-x-auto items-center scrollbar-none">
                      <TabPills
                        tabs={[
                          { key: "all", label: "全部" },
                          { key: "new", label: "新词" },
                          { key: "learning", label: "学习中" },
                          { key: "mastered", label: "已掌握" },
                        ]}
                        activeKey={masteryFilter}
                        onChange={setMasteryFilter}
                        variant="ghost"
                        activeStyle="dark"
                        size="sm"
                      />
                    </div>
                    <div className="hidden md:block w-px h-5 bg-hairline flex-shrink-0" />
                    <div className="flex gap-1.5 overflow-x-auto items-center scrollbar-none">
                      <TabPills
                        tabs={[
                          { key: "all", label: "不限" },
                          { key: "due", label: "待复习" },
                        ]}
                        activeKey={dueOnly ? "due" : "all"}
                        onChange={(key) => setDueOnly(key === "due")}
                        variant="ghost"
                        activeStyle="brand"
                        size="sm"
                      />
                    </div>
                    {/* Search */}
                    <div className="relative w-full md:w-56 md:ml-auto">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft"
                      />
                      <input
                        type="text"
                        placeholder="搜索单词…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 rounded-md bg-surface-card border border-transparent
                      text-sm text-ink placeholder:text-muted-soft
                      focus:bg-canvas focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20
                      transition-colors duration-150"
                      />
                    </div>
                  </div>
                </div>

                {/* Error state */}
                {list.error && (
                  <ErrorState title={list.error} onRetry={list.reload} className="py-8" />
                )}

                {/* Word grid */}
                {showEmpty ? (
                  <EmptyState
                    icon={BookOpen}
                    title={
                      debouncedQuery
                        ? `未找到匹配“${debouncedQuery}”的单词`
                        : dueOnly
                          ? "今天的词都复习完了！"
                          : "还没有生词"
                    }
                    description={
                      debouncedQuery
                        ? "试试其他关键词，或清空筛选条件"
                        : dueOnly
                          ? "保持节奏，明天继续"
                          : "看视频时点击字幕里的单词，就能加入词库"
                    }
                    action={
                      debouncedQuery ? null : (
                        <Link
                          href="/browse"
                          className="inline-block mt-3 text-sm font-semibold text-brand-500 hover:underline"
                        >
                          去频道看看 →
                        </Link>
                      )
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {list.items.map((w) => {
                      const mb = masteryBadge(w.mastery_level);
                      return (
                        <Card
                          key={w.id}
                          variant="outline"
                          padding={5}
                          className="flex flex-col gap-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-lg font-bold tracking-tight flex items-center gap-2">
                                {w.word}
                                <button
                                  onClick={() => speak(w.word, { rate: 1 })}
                                  className="w-6 h-6 rounded-full bg-surface-card flex items-center justify-center text-muted hover:bg-brand-500 hover:text-on-primary transition-colors duration-100 cursor-pointer"
                                  aria-label={`播放 ${w.word}`}
                                >
                                  <Volume2 size={13} />
                                </button>
                              </div>
                              {w.part_of_speech && (
                                <p className="text-xs text-muted-soft italic mt-[3px]">
                                  {w.part_of_speech}
                                </p>
                              )}
                              <p className="text-[13px] text-body leading-relaxed mt-1.5">
                                {w.translation ||
                                  w.definition ||
                                  (w.context_sentence ? `"${w.context_sentence}"` : "—")}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <Badge tone={mb.tone}>{mb.text}</Badge>
                              <button
                                onClick={() => handleDeleteWithUndo(w)}
                                className="w-6 h-6 rounded-full bg-surface-card flex items-center justify-center text-muted hover:bg-error hover:text-on-primary transition-colors duration-100 cursor-pointer"
                                aria-label={`删除 ${w.word}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* 翻页中指示 */}
                {list.loading && list.items.length > 0 && (
                  <div className="mt-6 flex justify-center">
                    <InlineSpinner />
                  </div>
                )}
                {list.loading && list.items.length === 0 && !list.error && (
                  <div className="mt-10 flex justify-center">
                    <InlineSpinner />
                  </div>
                )}

                {/* Pager — 服务端分页，筛选口径与 total 一致 */}
                {!list.error && !showEmpty && totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => list.setPage((p) => Math.max(1, p - 1))}
                      disabled={list.page <= 1 || list.loading}
                    >
                      <ChevronLeft size={14} />
                      上一页
                    </Button>
                    <span className="text-[13px] text-muted tabular-nums">
                      第 {list.page} / {totalPages} 页 · 共 {list.total} 词
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => list.setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={list.page >= totalPages || list.loading}
                    >
                      下一页
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </PageTransition>
  );
}
