"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useVocabularyPractice } from "@/hooks/usePractice";
import {
  BookOpen,
  Trash2,
  Volume2,
  Target,
  CheckCircle2,
  Flame,
  Dumbbell,
  Search,
} from "lucide-react";
import { TabPills } from "@/components/ui/TabPills";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { Modal } from "@/components/common/Modal";
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
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

// SM-2 review quality buttons — simplified to 3 tiers for faster review.
// Keyboard shortcuts: 1=忘了, 2=模糊, 3=记住了
const QUALITY_BUTTONS: {
  value: number;
  label: string;
  variant: ButtonVariant;
  key: string;
}[] = [
  { value: 1, label: "忘了", variant: "destructive", key: "1" },
  { value: 3, label: "模糊", variant: "outline", key: "2" },
  { value: 5, label: "记住了", variant: "primary", key: "3" },
];

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
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    due: 0,
    mastered: 0,
    learning: 0,
  });
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(false);
  const undoneRef = useRef(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const vocabPractice = useVocabularyPractice({
    count: 10,
    dueOnly: true,
    enabled: practiceOpen,
  });
  const { speak } = useSpeech();

  // Keyboard shortcuts for review: 1=忘了, 2=模糊, 3=记住了
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const btn = QUALITY_BUTTONS.find((b) => b.key === e.key);
      if (btn && words.length > 0) {
        // Apply to the first due word, or first word if none due
        const target = words.find((w) => w.mastery_level !== "mastered") ?? words[0];
        if (target) handleReview(target.id, btn.value);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [words]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    loadWords();
    loadStats();
  }, [dueOnly, isLoading, isAuthenticated]);

  async function loadWords() {
    setLoading(true);
    try {
      const data = await api<Paginated<VocabularyWord>>(
        `/api/v1/vocabulary?due_only=${dueOnly}&page=1&page_size=100`
      );
      setWords(data.items);
    } catch {
      toast.error("加载词汇失败");
    } finally {
      setLoading(false);
    }
  }

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

  async function handleReview(wordId: string, quality: number) {
    try {
      await api(`/api/v1/vocabulary/${wordId}/review?quality=${quality}`, {
        method: "POST",
      });
      loadWords();
      loadStats();
    } catch {
      toast.error("复习记录失败");
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
    setWords((prev) => prev.filter((w) => w.id !== word.id));
    setStats((prev) => ({ ...prev, total: prev.total - 1 }));

    // Show undo toast
    toast(`已移除「${word.word}」`, {
      duration: 5000,
      action: {
        label: "撤销",
        onClick: () => {
          // Undo: re-add the word to local state
          undoneRef.current = true;
          setWords((prev) => [word, ...prev]);
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

  // Filter words by search query
  const filteredWords = useMemo(() => {
    if (!searchQuery.trim()) return words;
    const q = searchQuery.toLowerCase();
    return words.filter(
      (w) =>
        w.word.toLowerCase().includes(q) ||
        w.translation?.toLowerCase().includes(q) ||
        w.definition?.toLowerCase().includes(q)
    );
  }, [words, searchQuery]);

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-12">
        {/* Page header */}
        <PageHeader crumb="学习" title="词汇本" />

        {/* Stat cards */}
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
            tone="warning"
            variant="label-top"
          />
        </div>

        {/* Practice button */}
        {stats.due > 0 && !practiceOpen && (
          <div className="mb-6">
            <Button onClick={() => setPracticeOpen(true)} icon={Dumbbell}>
              开始练习
            </Button>
          </div>
        )}

        {/* Practice modal */}
        <Modal
          open={practiceOpen}
          onClose={() => setPracticeOpen(false)}
          title="词汇练习"
          footer={null}
        >
          <UnifiedPracticePanel session={vocabPractice} levelLabel="词汇练习" />
        </Modal>

        {/* Section header + search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-0 mb-4">
          <SectionHeader
            title="全部单词"
            action={
              <TabPills
                tabs={[
                  { key: "all", label: "全部" },
                  { key: "due", label: "待复习" },
                ]}
                activeKey={dueOnly ? "due" : "all"}
                onChange={(key) => setDueOnly(key === "due")}
                variant="ghost"
                shape="rect"
              />
            }
            className="mt-0 mb-0"
          />
          {/* Search filter */}
          <div className="relative w-full sm:w-56">
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

        {/* Word grid */}
        {loading ? (
          <InlineSpinner />
        ) : filteredWords.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={
              searchQuery
                ? `未找到匹配“${searchQuery}”的单词`
                : dueOnly
                  ? "今天没有需要复习的单词！"
                  : "词汇本为空。观看视频时点击单词即可收藏。"
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredWords.map((w) => {
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

                  {/* Inline review controls — only show for words that need review */}
                  {w.mastery_level !== "mastered" && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-hairline">
                      <span className="text-xs text-muted mr-1">评分复习：</span>
                      {QUALITY_BUTTONS.map((q) => (
                        <Button
                          key={q.value}
                          variant={q.variant}
                          size="sm"
                          onClick={() => handleReview(w.id, q.value)}
                          title={`快捷键 ${q.key}`}
                        >
                          {q.label}
                          <kbd className="ml-1 text-[10px] opacity-50">{q.key}</kbd>
                        </Button>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </PageTransition>
  );
}
