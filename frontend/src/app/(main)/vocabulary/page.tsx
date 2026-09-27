"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useDailySession } from "@/hooks/useDailySession";
import {
  BookOpen,
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
import { type BadgeTone } from "@/components/common/Badge";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MetricCard } from "@/components/ui/MetricCard";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Image } from "@/components/ui/Image";
import { PageTransition } from "@/components/common/PageTransition";
import { DailyHero } from "@/components/vocabulary/DailyHero";
import { VocabWordAction, VocabWordCard } from "@/components/vocabulary/VocabWordCard";
import { useSpeech } from "@/hooks/useSpeech";
import { useVocabSets } from "@/hooks/useVocabSets";
import { relativeTime } from "@/lib/utils";
import type {
  Paginated,
  TodayTrainingSummary,
  VocabularyPreferences,
  VocabularyWord,
  VocabSet,
} from "@/types";

interface VocabStatsResponse {
  total: number;
  new_count: number;
  learning_count: number;
  reviewing_count: number;
  mastered_count: number;
  due_count: number;
}

const PAGE_SIZE = 24;

/**
 * 掌握度徽标。`new` 是「新词」而不是「待复习」：待复习另有到期口径
 * （`due_count`，由复习调度按 `next_review_at` 算），两者混用会让刚
 * 加进词库、一次都没复习过的词看起来已经欠着复习。
 */
function masteryBadge(level: string | null | undefined): {
  tone: BadgeTone;
  text: string;
} {
  if (level === "mastered") return { tone: "green", text: "已掌握" };
  if (level === "reviewing") return { tone: "brand", text: "复习中" };
  if (level === "learning") return { tone: "amber", text: "学习中" };
  return { tone: "neutral", text: "新词" };
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
  // topTab/libraryTab 写进 URL query (S8, 设计 §7.2)：从集合详情返回/浏览器后退都能复现视图。
  const router = useRouter();
  const searchParams = useSearchParams();
  const topTab = searchParams.get("tab") === "library" ? "library" : "today";
  // 词库内二级视图：视频集合 | 全部单词
  const libraryTab = searchParams.get("sub") === "words" ? "words" : "sets";

  /** tab 切换落 URL（replace，不刷历史栈）；today 是默认态，不占 query。 */
  function syncTabQuery(nextTop: "today" | "library", nextSub: "sets" | "words") {
    router.replace(
      nextTop === "library" ? `/vocabulary?tab=library&sub=${nextSub}` : "/vocabulary",
      { scroll: false }
    );
  }
  const setsView = useVocabSets(isAuthenticated && !isLoading);
  const daily = useDailySession(isAuthenticated && !isLoading);
  // 配额保存后就地生效，不必重拉整个今日队列（重拉会让 Hero 闪一下加载态）
  const [quota, setQuota] = useState<VocabularyPreferences | null>(null);
  const preferences = quota ?? daily.session?.preferences ?? null;
  const todaySummary: TodayTrainingSummary = daily.session?.today ?? {
    words_learned: 0,
    rounds: 0,
  };
  const [stats, setStats] = useState({
    total: 0,
    due: 0,
    mastered: 0,
    learning: 0,
  });
  const [dueOnly, setDueOnly] = useState(false);
  const [masteryFilter, setMasteryFilter] = useState<string>("all");
  // 统计是否到过一次（首启判断依赖它，见 loadStats）。
  const [statsLoaded, setStatsLoaded] = useState(false);
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
    } finally {
      // 首启判断要等统计回来，否则会先闪一张「词库还是空的」再跳回正常 Hero。
      setStatsLoaded(true);
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
    // 每个 toast 一个独立的撤销标记：多个待定删除同时存在时互不影响。
    let undone = false;
    // Remove from UI immediately
    list.setItems((prev) => prev.filter((w) => w.id !== word.id));
    setStats((prev) => ({ ...prev, total: prev.total - 1 }));

    // Show undo toast
    toast(`已移除「${word.word}」`, {
      duration: 5000,
      action: {
        label: "撤销",
        onClick: () => {
          // Undo: re-add the word to local state
          undone = true;
          list.setItems((prev) => [word, ...prev]);
          setStats((prev) => ({ ...prev, total: prev.total + 1 }));
        },
      },
      onDismiss: () => {
        // Only commit delete if undo was NOT clicked
        if (!undone) {
          handleDelete(word.id);
        }
      },
    });
  }

  /** 一键标记已掌握：词库卡片上的快速处理（无需进入复习打分）。 */
  async function handleMarkMastered(word: VocabularyWord) {
    try {
      await api(`/api/v1/vocabulary/${word.id}/mastered`, { method: "POST" });
      // 当前筛选不再包含该词时直接从列表移除；否则就地翻转徽标
      list.setItems((prev) =>
        masteryFilter !== "all" && masteryFilter !== "mastered"
          ? prev.filter((w) => w.id !== word.id)
          : prev.map((w) => (w.id === word.id ? { ...w, mastery_level: "mastered" } : w))
      );
      loadStats();
      toast.success(`已把「${word.word}」标记为已掌握`);
    } catch {
      toast.error("标记失败，请重试");
    }
  }

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const showEmpty = !list.loading && !list.error && list.items.length === 0;
  // 首启（一个词都没有）：Hero 换成收词引导，统计行不再摆一排 0。
  const firstRun = statsLoaded && stats.total === 0;

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
            onChange={(tab) => syncTabQuery(tab, libraryTab)}
            variant="ghost"
            activeStyle="dark"
            size="sm"
          />
        </div>

        {topTab === "today" ? (
          <>
            {/* 今日行动卡：掌握环 + 今日队列 + CTA + 今日已学/配额（同一张卡，见 DailyHero） */}
            <DailyHero
              newTotal={daily.session?.totals.new_total ?? 0}
              dueTotal={daily.session?.totals.due_total ?? 0}
              total={stats.total}
              mastered={stats.mastered}
              loading={daily.loading || !statsLoaded}
              today={todaySummary}
              preferences={preferences}
              onQuotaSaved={setQuota}
            />

            {!firstRun && (
              /* 词库统计：Hero 已经讲了「今天要做什么」，这行只交代词库总量，
                 所以不给任何一张卡加外圈 ring，也不用 warning 色——「学习中」
                 是进度不是警告。语义色只留「待复习」brand 与「已掌握」success。 */
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
                <MetricCard icon={BookOpen} label="总计" value={stats.total} variant="label-top" />
                <MetricCard
                  icon={Target}
                  label="待复习"
                  value={stats.due}
                  tone="brand"
                  variant="label-top"
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
                  variant="label-top"
                />
              </div>
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
                onChange={(sub) => syncTabQuery("library", sub)}
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
                    {list.items.map((w) => (
                      <VocabWordCard
                        key={w.id}
                        word={w.word}
                        ipa={w.ipa}
                        partOfSpeech={w.part_of_speech}
                        meaning={
                          w.translation ||
                          w.definition ||
                          (w.context_sentence ? `"${w.context_sentence}"` : "—")
                        }
                        badge={masteryBadge(w.mastery_level)}
                        onSpeak={() => speak(w.word, { rate: 1 })}
                        actions={
                          <>
                            {w.mastery_level !== "mastered" && (
                              <VocabWordAction
                                tone="success"
                                ariaLabel={`标记 ${w.word} 为已掌握`}
                                onClick={() => handleMarkMastered(w)}
                              >
                                标为已掌握
                              </VocabWordAction>
                            )}
                            <VocabWordAction
                              tone="danger"
                              ariaLabel={`删除 ${w.word}`}
                              onClick={() => handleDeleteWithUndo(w)}
                            >
                              删除
                            </VocabWordAction>
                          </>
                        }
                      />
                    ))}
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
