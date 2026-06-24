"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MicIcon } from "@/components/common/Icons";
import SpeakingRecorder from "@/components/speaking/SpeakingRecorder";
import { BookOpen, Repeat, Mic, ArrowRight, Loader2, CheckCircle, TrendingUp } from "lucide-react";

// --- Types ---

interface SpeakingAttemptItem {
  id: string;
  subtitle_id: string | null;
  accuracy: number | null;
  fluency: number | null;
  completeness: number | null;
  feedback: string | null;
  transcript: string | null;
  word_scores: unknown[] | null;
  audio_duration: number | null;
  mode: string;
  rubric_id: string | null;
  created_at: string;
}

interface AttemptsResponse {
  items: SpeakingAttemptItem[];
  page: number;
  page_size: number;
  has_more: boolean;
}

// --- Mode labels ---

const MODE_LABELS: Record<string, string> = {
  read_aloud: "朗读",
  shadowing: "跟读",
  free_speaking: "自由说",
};

// --- Time ago helper ---

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

// --- Mode cards data ---

const MODE_CARDS = [
  {
    key: "read_aloud" as const,
    title: "朗读",
    subtitle: "Read Aloud",
    icon: BookOpen,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-500",
    tag: "推荐新手",
    tagClass: "bg-success-soft text-success",
    description: "跟着字幕朗读，逐句纠正发音。最适合刚开始练习口语的学习者。",
    href: "/browse",
    buttonText: "选择视频",
    buttonClass: "btn-outline",
  },
  {
    key: "shadowing" as const,
    title: "跟读",
    subtitle: "Shadowing",
    icon: Repeat,
    iconBg: "bg-indigo-soft",
    iconColor: "text-indigo",
    tag: null,
    tagClass: "",
    description: "听原音后立即复述，提升语感和流利度。模仿母语者的节奏和语调。",
    href: "/browse",
    buttonText: "选择视频",
    buttonClass: "btn-outline",
  },
  {
    key: "free_speaking" as const,
    title: "自由说",
    subtitle: "Free Speaking",
    icon: Mic,
    iconBg: "bg-warning-soft",
    iconColor: "text-warning",
    tag: "进阶挑战",
    tagClass: "bg-warning-soft text-warning",
    description: "不依赖字幕，自由发挥话题表达。AI 智能评估你的表达力和连贯性。",
    href: null,
    buttonText: "开始练习",
    buttonClass: "btn-primary",
  },
];

// --- Main Page ---

export default function SpeakingPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [attempts, setAttempts] = useState<SpeakingAttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const data = await api<AttemptsResponse>("/api/v1/speaking/attempts?page_size=3");
        setAttempts(data.items);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated]);

  function handleModeClick(card: (typeof MODE_CARDS)[number]) {
    if (card.key === "free_speaking") {
      setShowRecorder(true);
    } else {
      router.push(card.href!);
    }
  }

  function getAvgScore(a: SpeakingAttemptItem): number | null {
    if (a.accuracy === null) return null;
    const scores = [a.accuracy, a.fluency, a.completeness].filter((v) => v !== null) as number[];
    return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
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
          <div className="page-crumb">口语练习</div>
          <h1 className="page-title">选择模式，开始练习</h1>
          <p className="page-desc">三种练习模式，从朗读到自由说，逐步提升你的英语口语。</p>
        </div>

        {/* Free speaking recorder */}
        {showRecorder && (
          <div className="card-outline mb-8 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mic size={18} className="text-brand-500" />
                <h3 className="text-sm font-semibold text-ink">自由口语练习</h3>
              </div>
              <button onClick={() => setShowRecorder(false)} className="btn-ghost text-xs">
                返回
              </button>
            </div>
            <SpeakingRecorder />
          </div>
        )}

        {/* Mode cards */}
        {!showRecorder && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px]">
            {MODE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.key} className="mode-card" onClick={() => handleModeClick(card)}>
                  <div className="flex items-start justify-between mb-[18px]">
                    <div
                      className={cn(
                        "w-[46px] h-[46px] rounded-xl flex items-center justify-center",
                        card.iconBg,
                        card.iconColor
                      )}
                    >
                      <Icon size={22} />
                    </div>
                    {card.tag && (
                      <span
                        className={cn(
                          "rounded-pill px-2.5 py-1 text-[11px] font-bold",
                          card.tagClass
                        )}
                      >
                        {card.tag}
                      </span>
                    )}
                  </div>
                  <h3 className="!text-[20px] !font-bold !tracking-tight !m-0">{card.title}</h3>
                  <p className="text-xs text-muted-soft mt-0.5 mb-2.5">{card.subtitle}</p>
                  <p className="text-sm text-muted leading-relaxed !m-0 mb-5">{card.description}</p>
                  <button
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-sm transition-colors duration-150",
                      card.buttonClass
                    )}
                  >
                    {card.buttonText}
                    <ArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent attempts */}
        {!showRecorder && (
          <div className="mt-9">
            <div className="sec-head !mt-0">
              <h2 className="sec-title">最近练习</h2>
              <a className="sec-link">查看全部</a>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={24} className="animate-spin text-brand-500" />
              </div>
            ) : attempts.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-soft">
                  <MicIcon className="h-8 w-8 text-muted" />
                </div>
                <p className="text-sm text-muted">还没有练习记录，选一个模式开始吧！</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {attempts.map((attempt) => {
                  const avg = getAvgScore(attempt);
                  return (
                    <div
                      key={attempt.id}
                      className="flex items-center gap-3.5 bg-canvas border border-hairline rounded-lg px-4 py-3.5 hover:border-ink transition-colors duration-150"
                    >
                      {/* Icon box */}
                      <div className="w-[38px] h-[38px] rounded-[10px] bg-brand-50 text-brand-500 flex items-center justify-center flex-shrink-0">
                        <Mic size={17} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {MODE_LABELS[attempt.mode] || attempt.mode}
                          </span>
                          <span className="text-xs text-muted">{timeAgo(attempt.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-3.5 mt-1.5 flex-wrap">
                          {attempt.accuracy !== null && (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <CheckCircle size={12} className="text-success" />
                              准确度 {Math.round(attempt.accuracy)}
                            </span>
                          )}
                          {attempt.fluency !== null && (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <CheckCircle size={12} className="text-indigo" />
                              流利度 {Math.round(attempt.fluency)}
                            </span>
                          )}
                          {attempt.completeness !== null && (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <CheckCircle size={12} className="text-warning" />
                              完整度 {Math.round(attempt.completeness)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Score badge */}
                      {avg !== null && (
                        <div className="text-[13px] font-bold bg-surface-card px-3 py-1.5 rounded-pill flex-shrink-0">
                          {avg}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
