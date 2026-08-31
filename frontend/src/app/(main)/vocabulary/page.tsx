"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import {
  BookOpen,
  Trash2,
  Volume2,
  Target,
  CheckCircle2,
  Flame,
  Search,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TabPills } from "@/components/ui/TabPills";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MetricCard } from "@/components/ui/MetricCard";
import { PageTransition } from "@/components/common/PageTransition";
import { useSpeech } from "@/hooks/useSpeech";
import type { Paginated, VocabularyWord } from "@/types";

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

export default function VocabularyPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
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
  // 复习入口收敛为唯一的「单词训练」（/vocabulary/drill）：
  // 本页只承担浏览/管理，不再内嵌快速复习模态与卡片评分按钮。
  const list = usePaginatedList<VocabularyWord>({
    fetcher: (page) => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (dueOnly) params.set("due_only", "true");
      if (masteryFilter !== "all") params.set("mastery", masteryFilter);
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
        {/* Page head: title + desc + drill CTA — 唯一的复习入口 */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-ink">词汇本</h1>
            <p className="text-[13px] text-muted mt-1">
              你在视频中收藏与练习过的词汇，按掌握度安排复习
            </p>
          </div>
          {stats.due > 0 && (
            <Link
              href="/vocabulary/drill"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-brand-500 text-on-primary text-sm font-semibold shadow-brand hover:bg-brand-600 hover:-translate-y-0.5 transition-all"
            >
              <GraduationCap size={16} />
              单词训练
              <span className="bg-white/20 px-2 py-0.5 rounded-pill text-xs">{stats.due}</span>
            </Link>
          )}
        </div>

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

        {/* Filter bar: 掌握度筛选 + 全部/待复习 + 搜索（均为服务端筛选） */}
        <div className="filter-bar mb-5">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex gap-1.5 overflow-x-auto items-center scrollbar-none">
              <TabPills
                tabs={[
                  { key: "all", label: "全部" },
                  { key: "new", label: "新词" },
                  { key: "learning", label: "学习中" },
                  { key: "reviewing", label: "复习中" },
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
        {list.error && <ErrorState title={list.error} onRetry={list.reload} className="py-8" />}

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
                  : "看视频时点击字幕里的单词，就能加入词汇本"
            }
            action={
              debouncedQuery ? null : dueOnly ? (
                <Link
                  href="/browse"
                  className="inline-block mt-3 text-sm font-semibold text-brand-500 hover:underline"
                >
                  去看视频 →
                </Link>
              ) : (
                <Link
                  href="/browse"
                  className="inline-block mt-3 text-sm font-semibold text-brand-500 hover:underline"
                >
                  去发现视频 →
                </Link>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {list.items.map((w) => {
              const mb = masteryBadge(w.mastery_level);
              return (
                <Card key={w.id} variant="outline" padding={5} className="flex flex-col gap-3">
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
      </main>
    </PageTransition>
  );
}
