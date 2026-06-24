"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { BookOpen, Trash2, Volume2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
  mastery_level?: string | null;
}

interface VocabListResponse {
  items: VocabWord[];
  page: number;
  page_size: number;
  has_more: boolean;
  stats: { total: number; due: number; mastered?: number; learning?: number };
}

const QUALITY_BUTTONS = [
  { value: 0, label: "Forgot", color: "bg-red-500 hover:bg-red-600" },
  { value: 1, label: "Hard", color: "bg-orange-500 hover:bg-orange-600" },
  { value: 2, label: "Difficult", color: "bg-amber-500 hover:bg-amber-600" },
  { value: 3, label: "OK", color: "bg-lime-600 hover:bg-lime-700" },
  { value: 4, label: "Easy", color: "bg-green-600 hover:bg-green-700" },
  { value: 5, label: "Perfect", color: "bg-emerald-600 hover:bg-emerald-700" },
];

function getLevelBadge(level: string | null | undefined) {
  if (!level) return { text: "待复习", cls: "bg-brand-50 text-brand-500" };
  switch (level) {
    case "mastered":
      return { text: "已掌握", cls: "bg-success-soft text-success" };
    case "learning":
      return { text: "学习中", cls: "bg-warning-soft text-warning" };
    default:
      return { text: "待复习", cls: "bg-brand-50 text-brand-500" };
  }
}

export default function VocabularyPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [words, setWords] = useState<VocabWord[]>([]);
  const [stats, setStats] = useState({ total: 0, due: 0, mastered: 0, learning: 0 });
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(false);
  const { speak } = useSpeech();

  const nextDueWord = words.find(
    (w) => !w.next_review_at || new Date(w.next_review_at) <= new Date()
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadWords();
  }, [dueOnly, isLoading, isAuthenticated]);

  async function loadWords() {
    setLoading(true);
    try {
      const data = await api<VocabListResponse>(
        `/api/v1/vocabulary?due_only=${dueOnly}&page=1&page_size=100`
      );
      setWords(data.items);
      setStats({
        total: data.stats.total,
        due: data.stats.due,
        mastered: data.stats.mastered ?? 0,
        learning: data.stats.learning ?? 0,
      });
    } catch {
      toast.error("加载词汇失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(wordId: string, quality: number) {
    try {
      await api(`/api/v1/vocabulary/${wordId}/review?quality=${quality}`, { method: "POST" });
      loadWords();
    } catch {
      toast.error("复习记录失败");
    }
  }

  async function handleDelete(wordId: string) {
    try {
      await api(`/api/v1/vocabulary/${wordId}`, { method: "DELETE" });
      toast.success("已移除单词");
      loadWords();
    } catch {
      toast.error("移除失败");
    }
  }

  if (isLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </main>
    );
  }

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        {/* Page header */}
        <div className="page-head">
          <div className="page-crumb">学习</div>
          <h1 className="page-title">词汇本</h1>
          <p className="page-desc">收藏的生词在这里,用间隔复习算法帮你长期记忆。</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
          <div className="stat-card">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted mb-2">
              <BookOpen size={14} /> 总计
            </div>
            <div className="text-[28px] font-extrabold tracking-display-md">{stats.total}</div>
          </div>
          <div className="stat-card !border-brand-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-500 mb-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1" />
              </svg>{" "}
              待复习
            </div>
            <div className="text-[28px] font-extrabold tracking-display-md text-brand-500">
              {stats.due}
            </div>
          </div>
          <div className="stat-card !border-success-soft">
            <div className="flex items-center gap-2 text-xs font-semibold text-success mb-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>{" "}
              已掌握
            </div>
            <div className="text-[28px] font-extrabold tracking-display-md text-success">
              {stats.mastered}
            </div>
          </div>
          <div className="stat-card !border-warning-soft">
            <div className="flex items-center gap-2 text-xs font-semibold text-warning mb-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2C8 6 6 8 6 12a6 6 0 0 0 12 0c0-2-2-4-3-6-1 2-3 2-3-4Z" />
              </svg>{" "}
              学习中
            </div>
            <div className="text-[28px] font-extrabold tracking-display-md text-warning">
              {stats.learning}
            </div>
          </div>
        </div>

        {/* Review bar */}
        {stats.due > 0 && nextDueWord && (
          <div className="flex items-center justify-between gap-4 flex-wrap bg-canvas border border-hairline rounded-lg p-5 mb-6">
            <div>
              <div className="text-sm font-semibold">复习下一个单词</div>
              <div className="text-xs text-muted mt-0.5">
                <b className="text-brand-500">{nextDueWord.word}</b> · 还有{" "}
                <b className="text-brand-500">{stats.due}</b> 个待复习 · 建议用时{" "}
                {Math.max(1, Math.ceil(stats.due / 3))} 分钟
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {QUALITY_BUTTONS.map((q) => (
                <button
                  key={q.value}
                  onClick={() => handleReview(nextDueWord.id, q.value)}
                  className={cn(
                    "px-4 py-2 rounded-sm text-[13px] font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:brightness-110",
                    q.color
                  )}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section header */}
        <div className="sec-head !mt-0">
          <h2 className="sec-title">全部单词</h2>
          <div className="tab-container !p-0 !bg-transparent">
            <button
              onClick={() => setDueOnly(false)}
              className={cn("tab-pill !rounded-sm", !dueOnly && "tab-pill-active")}
            >
              全部
            </button>
            <button
              onClick={() => setDueOnly(true)}
              className={cn("tab-pill !rounded-sm", dueOnly && "tab-pill-active")}
            >
              待复习
            </button>
          </div>
        </div>

        {/* Word grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-brand-500" />
          </div>
        ) : words.length === 0 ? (
          <div className="py-20 text-center">
            <BookOpen size={48} className="mx-auto text-muted" />
            <p className="mt-4 text-muted">
              {dueOnly ? "今天没有需要复习的单词！" : "词汇本为空。观看视频时点击单词即可收藏。"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {words.map((w) => {
              const badge = getLevelBadge(w.mastery_level);
              return (
                <div
                  key={w.id}
                  className="flex flex-col gap-3 bg-canvas border border-hairline rounded-lg px-5 py-[18px] hover:border-ink hover:shadow-soft transition-all duration-150"
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
                        {w.definition || (w.context_sentence ? `"${w.context_sentence}"` : "—")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span
                        className={cn(
                          "text-[11px] font-bold px-2.5 py-[3px] rounded-pill",
                          badge.cls
                        )}
                      >
                        {badge.text}
                      </span>
                      <button
                        onClick={() => {
                          if (window.confirm(`确定要删除单词 "${w.word}" 吗？`)) {
                            handleDelete(w.id);
                          }
                        }}
                        className="w-6 h-6 rounded-full bg-surface-card flex items-center justify-center text-muted hover:bg-red-500 hover:text-white transition-colors duration-100 cursor-pointer"
                        aria-label={`删除 ${w.word}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Inline review controls */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-hairline">
                    <span className="text-[11px] text-muted mr-1">评分复习：</span>
                    {QUALITY_BUTTONS.map((q) => (
                      <button
                        key={q.value}
                        onClick={() => handleReview(w.id, q.value)}
                        className={cn(
                          "px-2 py-1 rounded-sm text-[11px] font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:brightness-110",
                          q.color
                        )}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
