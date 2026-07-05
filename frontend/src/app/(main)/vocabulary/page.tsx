"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { TabPills } from "@/components/ui/TabPills";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MetricCard } from "@/components/ui/MetricCard";
import { Modal } from "@/components/common/Modal";
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
import { useSpeech } from "@/hooks/useSpeech";

interface VocabWord {
  id: string;
  word: string;
  context_sentence: string | null;
  review_count: number;
  next_review_at: string | null;
  created_at: string;
  part_of_speech?: string | null;
  definition?: string | null;
  translation?: string | null;
  mastery_level?: string | null;
}

interface VocabListResponse {
  words: VocabWord[];
  // 后端 list 接口只返回 total/due；mastered/learning 由 /vocabulary/stats 提供
  stats: { total: number; due: number };
}

interface VocabStatsResponse {
  total: number;
  new_count: number;
  learning_count: number;
  reviewing_count: number;
  mastered_count: number;
  due_count: number;
}

// SM-2 review quality buttons, grouped into 3 visual tiers (fail / neutral / pass).
const QUALITY_BUTTONS: {
  value: number;
  label: string;
  variant: ButtonVariant;
}[] = [
  { value: 0, label: "Forgot", variant: "destructive" },
  { value: 1, label: "Hard", variant: "outline" },
  { value: 2, label: "Difficult", variant: "outline" },
  { value: 3, label: "OK", variant: "primary" },
  { value: 4, label: "Easy", variant: "primary" },
  { value: 5, label: "Perfect", variant: "primary" },
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
  const [words, setWords] = useState<VocabWord[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    due: 0,
    mastered: 0,
    learning: 0,
  });
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VocabWord | null>(null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const vocabPractice = useVocabularyPractice({
    count: 10,
    dueOnly: true,
    enabled: practiceOpen,
  });
  const { speak } = useSpeech();

  const nextDueWord = words.find(
    (w) => !w.next_review_at || new Date(w.next_review_at) <= new Date(),
  );

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    loadWords();
    loadStats();
  }, [dueOnly, isLoading, isAuthenticated]);

  async function loadWords() {
    setLoading(true);
    try {
      const data = await api<VocabListResponse>(
        `/api/v1/vocabulary?due_only=${dueOnly}&limit=100`,
      );
      setWords(data.words);
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
      toast.success("已移除单词");
      loadWords();
      loadStats();
    } catch {
      toast.error("移除失败");
    }
  }

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        {/* Page header */}
        <PageHeader
          crumb="学习"
          title="词汇本"
          description="收藏的生词在这里,用间隔复习算法帮你长期记忆。"
        />

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
          <MetricCard
            icon={BookOpen}
            label="总计"
            value={stats.total}
            variant="label-top"
          />
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

        {/* Review bar */}
        {stats.due > 0 && nextDueWord && (
          <div className="flex items-center justify-between gap-4 flex-wrap bg-canvas border border-hairline rounded-lg p-5 mb-6">
            <div>
              <div className="text-sm font-semibold">复习下一个单词</div>
              <div className="text-xs text-muted mt-0.5">
                <b className="text-brand-500">{nextDueWord.word}</b> · 还有{" "}
                <b className="text-brand-500">{stats.due}</b> 个待复习 ·
                建议用时 {Math.max(1, Math.ceil(stats.due / 3))} 分钟
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {QUALITY_BUTTONS.map((q) => (
                <Button
                  key={q.value}
                  variant={q.variant}
                  size="sm"
                  onClick={() => handleReview(nextDueWord.id, q.value)}
                >
                  {q.label}
                </Button>
              ))}
            </div>
          </div>
        )}

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

        {/* Section header */}
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
          className="!mt-0"
        />

        {/* Word grid */}
        {loading ? (
          <InlineSpinner />
        ) : words.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={
              dueOnly
                ? "今天没有需要复习的单词！"
                : "词汇本为空。观看视频时点击单词即可收藏。"
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {words.map((w) => {
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
                          (w.context_sentence
                            ? `"${w.context_sentence}"`
                            : "—")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <Badge tone={mb.tone}>{mb.text}</Badge>
                      <button
                        onClick={() => setDeleteTarget(w)}
                        className="w-6 h-6 rounded-full bg-surface-card flex items-center justify-center text-muted hover:bg-red-500 hover:text-white transition-colors duration-100 cursor-pointer"
                        aria-label={`删除 ${w.word}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Inline review controls */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-hairline">
                    <span className="text-xs text-muted mr-1">评分复习：</span>
                    {QUALITY_BUTTONS.map((q) => (
                      <Button
                        key={q.value}
                        variant={q.variant}
                        size="sm"
                        onClick={() => handleReview(w.id, q.value)}
                      >
                        {q.label}
                      </Button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title="删除单词"
        confirmLabel="确认删除"
        message={
          deleteTarget ? `确定要删除单词「${deleteTarget.word}」吗？` : ""
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) handleDelete(target.id);
        }}
      />
    </main>
  );
}
