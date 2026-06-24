"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Sparkles, Loader2, Mic, BarChart3, BookOpen, Play } from "lucide-react";
import type { User } from "@/types";

interface AIStatsPanelProps {
  user: User;
}

interface AIStats {
  summary: string;
  stats: {
    total_speaking_attempts: number;
    average_accuracy: number;
    vocabulary_count: number;
    videos_watched: number;
  };
}

export default function AIStatsPanel({ user }: AIStatsPanelProps) {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [aiStats, setAiStats] = useState<AIStats["stats"] | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const isPro = user.plan === "pro";

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const order = await api<{ payment_url: string }>("/api/v1/payments/create-order", {
        method: "POST",
        body: JSON.stringify({ plan: "pro_monthly" }),
      });
      await api(order.payment_url);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "支付失败");
    } finally {
      setUpgrading(false);
    }
  }

  async function loadAIData() {
    setLoadingAI(true);
    try {
      const [summaryRes, recRes] = await Promise.allSettled([
        api<AIStats>("/api/v1/ai/assistant/summary"),
        api<{ recommendation: string }>("/api/v1/ai/assistant/recommend"),
      ]);
      if (summaryRes.status === "fulfilled") {
        setAiSummary(summaryRes.value.summary);
        setAiStats(summaryRes.value.stats);
      }
      if (recRes.status === "fulfilled") {
        setRecommendation(recRes.value.recommendation);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoadingAI(false);
    }
  }

  const stats = [
    { label: "跟读次数", value: aiStats?.total_speaking_attempts ?? 0, icon: Mic },
    { label: "准确率", value: `${aiStats?.average_accuracy ?? 0}%`, icon: BarChart3 },
    { label: "词汇量", value: aiStats?.vocabulary_count ?? 0, icon: BookOpen },
    { label: "视频数", value: aiStats?.videos_watched ?? 0, icon: Play },
  ];

  return (
    <>
      <section className="border-b border-hairline bg-canvas">
        <div className="container-page py-8 sm:py-12">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-4xl sm:text-5xl font-normal text-ink tracking-display-xl leading-tight">
                你好{user.name ? `，${user.name}` : ""}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {isPro ? "Pro 会员，全部功能已解锁。" : "试用中。升级 Pro 解锁 AI 助手。"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                等级
              </label>
              <select
                value={user.level || ""}
                onChange={async (e) => {
                  const newLevel = e.target.value;
                  try {
                    await api("/api/v1/users/me", {
                      method: "PATCH",
                      body: JSON.stringify({ level: newLevel || null }),
                    });
                    toast.success(`等级已设为 ${newLevel}`);
                  } catch {
                    toast.error("设置失败");
                  }
                }}
                className="rounded-md border border-hairline bg-canvas px-3 py-1.5 text-sm text-ink focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20"
              >
                <option value="">未设置</option>
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {!isPro && (
              <button onClick={handleUpgrade} disabled={upgrading} className="btn-primary">
                <Sparkles size={14} />
                {upgrading ? "处理中..." : "升级 Pro"}
              </button>
            )}
          </div>
        </div>
      </section>

      {isPro && aiStats && (
        <section className="container-page py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="card-outline !p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <s.icon size={14} /> {s.label}
                </div>
                <p className="mt-1.5 font-display text-3xl font-normal text-ink tracking-display-sm">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {isPro && (
        <section className="container-page pb-6">
          <div className="card-dark !p-6">
            {loadingAI ? (
              <p className="text-sm text-white/70 font-sans">AI 思考中...</p>
            ) : (
              <div className="space-y-4">
                {aiSummary && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-caption-wide text-coral">
                      学习总结
                    </h3>
                    <p className="mt-1.5 text-sm text-white/80 leading-relaxed">{aiSummary}</p>
                  </div>
                )}
                {recommendation && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-caption-wide text-coral">
                      今日推荐
                    </h3>
                    <p className="mt-1.5 text-sm text-white/80 leading-relaxed">{recommendation}</p>
                  </div>
                )}
                {!aiSummary && !recommendation && (
                  <p className="text-sm text-white/60 font-sans">
                    开始学习后，AI 会在这里总结你的学习进度。
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
